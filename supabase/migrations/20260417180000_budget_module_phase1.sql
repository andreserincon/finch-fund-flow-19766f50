-- =====================================================================
-- Budget module – Phase 1
-- =====================================================================
-- Introduces the tables needed to plan a full-year budget on a monthly
-- basis, broken down by account and transaction category.
--
--   budget_scenarios              one named plan per year (e.g. "Base 2026")
--   budget_scenario_parameters    sibling 1:1 row holding the parametric
--                                 knobs (inflation %, growth %, multiplier)
--   budget_lines                  one row per (scenario, month, account,
--                                 transaction_type, category) with the
--                                 budgeted amount
--
-- Revisions are modelled by copying a scenario: `parent_scenario_id`
-- points at the source, `revision_number` is 0 for originals and
-- increments for each Feb/Jul revision. Actual revision mechanics come
-- in Phase 5; only the columns are introduced here.
--
-- Roles follow the existing convention:
--   * can_view(auth.uid())  → SELECT
--   * is_admin(auth.uid())  → INSERT / UPDATE / DELETE
-- =====================================================================

-- ---------------------------------------------------------------------
-- budget_scenarios
-- ---------------------------------------------------------------------
CREATE TABLE public.budget_scenarios (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year                 INTEGER NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  scenario_name        TEXT NOT NULL,
  is_active            BOOLEAN NOT NULL DEFAULT false,
  parent_scenario_id   UUID REFERENCES public.budget_scenarios(id) ON DELETE SET NULL,
  revision_number      INTEGER NOT NULL DEFAULT 0,
  revision_month       INTEGER CHECK (revision_month BETWEEN 1 AND 12),
  notes                TEXT,
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (year, scenario_name)
);

CREATE INDEX idx_budget_scenarios_year_active
  ON public.budget_scenarios (year, is_active);

CREATE INDEX idx_budget_scenarios_parent
  ON public.budget_scenarios (parent_scenario_id);

-- Ensure at most one active scenario per year. Using a partial unique
-- index so multiple is_active=false rows are still allowed.
CREATE UNIQUE INDEX idx_budget_scenarios_one_active_per_year
  ON public.budget_scenarios (year)
  WHERE is_active = true;

CREATE TRIGGER update_budget_scenarios_updated_at
  BEFORE UPDATE ON public.budget_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- budget_scenario_parameters
-- ---------------------------------------------------------------------
CREATE TABLE public.budget_scenario_parameters (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_scenario_id               UUID NOT NULL UNIQUE
                                     REFERENCES public.budget_scenarios(id)
                                     ON DELETE CASCADE,
  -- Manual annual inflation assumption applied uniformly across months.
  -- Stored as a percent (e.g. 135.00 for 135% annual inflation).
  inflation_percent                DECIMAL(7,2) NOT NULL DEFAULT 0,
  -- Expected growth in paying-membership count over the year.
  membership_growth_percent        DECIMAL(7,2) NOT NULL DEFAULT 0,
  -- Multiplier applied to the extraordinary_income category projections.
  -- 1.00 = no change; 1.25 = +25%, 0.80 = -20%, etc.
  extraordinary_income_multiplier  DECIMAL(6,4) NOT NULL DEFAULT 1.0000,
  created_at                       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at                       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TRIGGER update_budget_scenario_parameters_updated_at
  BEFORE UPDATE ON public.budget_scenario_parameters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create a parameters row whenever a scenario is created.
-- Keeps the 1:1 invariant without requiring the client to make two calls.
CREATE OR REPLACE FUNCTION public.ensure_budget_scenario_parameters()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.budget_scenario_parameters (budget_scenario_id)
  VALUES (NEW.id)
  ON CONFLICT (budget_scenario_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_budget_scenarios_create_parameters
  AFTER INSERT ON public.budget_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.ensure_budget_scenario_parameters();

-- ---------------------------------------------------------------------
-- budget_lines
-- ---------------------------------------------------------------------
CREATE TABLE public.budget_lines (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_scenario_id   UUID NOT NULL
                         REFERENCES public.budget_scenarios(id)
                         ON DELETE CASCADE,
  month                INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  account              account_type NOT NULL,
  transaction_type     transaction_type NOT NULL,
  category             transaction_category NOT NULL,
  budgeted_amount      DECIMAL(14,2) NOT NULL DEFAULT 0,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (budget_scenario_id, month, account, transaction_type, category)
);

CREATE INDEX idx_budget_lines_scenario_month
  ON public.budget_lines (budget_scenario_id, month);

CREATE INDEX idx_budget_lines_scenario_account
  ON public.budget_lines (budget_scenario_id, account);

CREATE TRIGGER update_budget_lines_updated_at
  BEFORE UPDATE ON public.budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- Row-level security
-- =====================================================================

ALTER TABLE public.budget_scenarios             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_scenario_parameters   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines                 ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- budget_scenarios policies
-- ---------------------------------------------------------------------
CREATE POLICY "Treasury viewers can view budget scenarios"
  ON public.budget_scenarios FOR SELECT
  TO authenticated
  USING (public.can_view(auth.uid()));

CREATE POLICY "Admins can insert budget scenarios"
  ON public.budget_scenarios FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update budget scenarios"
  ON public.budget_scenarios FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete budget scenarios"
  ON public.budget_scenarios FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- budget_scenario_parameters policies
-- ---------------------------------------------------------------------
CREATE POLICY "Treasury viewers can view budget parameters"
  ON public.budget_scenario_parameters FOR SELECT
  TO authenticated
  USING (public.can_view(auth.uid()));

CREATE POLICY "Admins can insert budget parameters"
  ON public.budget_scenario_parameters FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update budget parameters"
  ON public.budget_scenario_parameters FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete budget parameters"
  ON public.budget_scenario_parameters FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- budget_lines policies
-- ---------------------------------------------------------------------
CREATE POLICY "Treasury viewers can view budget lines"
  ON public.budget_lines FOR SELECT
  TO authenticated
  USING (public.can_view(auth.uid()));

CREATE POLICY "Admins can insert budget lines"
  ON public.budget_lines FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update budget lines"
  ON public.budget_lines FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete budget lines"
  ON public.budget_lines FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));
