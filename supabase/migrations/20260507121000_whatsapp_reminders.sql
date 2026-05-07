-- =====================================================================
-- WhatsApp overdue payment reminders (Twilio)
-- =====================================================================
-- Adds the data model for queueing automated overdue-payment reminders
-- on the 3rd business day of each month, then sending them via Twilio
-- WhatsApp after a treasurer reviews the queue.
--
--   members.whatsapp_number     E.164 contact number for messaging
--   members.whatsapp_opt_out    member-level opt-out toggle
--   reminder_status enum        lifecycle states for a reminder row
--   payment_reminders           the queue itself; one row per
--                               (member, period_year, period_month)
--
-- Roles follow the existing convention:
--   * can_view(auth.uid()) → SELECT
--   * is_admin(auth.uid()) → INSERT / UPDATE / DELETE
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. members — new contact + opt-out columns
-- ---------------------------------------------------------------------
-- Note: the existing `phone_number` column on members is repurposed
-- in the UI as Matrícula (lodge enrollment ID). A separate column is
-- needed for actual messaging.
ALTER TABLE public.members
  ADD COLUMN whatsapp_number TEXT NULL,
  ADD COLUMN whatsapp_opt_out BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.members
  ADD CONSTRAINT members_whatsapp_number_format
  CHECK (
    whatsapp_number IS NULL
    OR whatsapp_number = ''
    OR whatsapp_number ~ '^\+[0-9]{8,15}$'
  );

-- ---------------------------------------------------------------------
-- 1b. member_balances view — expose whatsapp fields
-- ---------------------------------------------------------------------
-- The view is rebuilt to keep the same shape it had after the event
-- migration plus two new columns for messaging-related data. Editing
-- the view in place via CREATE OR REPLACE keeps RLS and consumers
-- intact.
CREATE OR REPLACE VIEW public.member_balances AS
WITH monthly_fees_owed AS (
  SELECT
    m.id AS member_id,
    COALESCE(SUM(mf.amount), 0) AS total_monthly_fees
  FROM public.members m
  LEFT JOIN public.monthly_fees mf ON
    mf.fee_type = m.fee_type AND
    mf.year_month >= DATE_TRUNC('month', m.join_date) AND
    mf.year_month <= DATE_TRUNC('month', CURRENT_DATE)
  GROUP BY m.id
),
event_fees_owed AS (
  SELECT
    member_id,
    COALESCE(SUM(amount_owed), 0) AS total_event_fees,
    COALESCE(SUM(amount_paid), 0) AS total_event_paid
  FROM public.event_member_payments
  WHERE member_id IS NOT NULL
  GROUP BY member_id
),
member_payments AS (
  SELECT
    member_id,
    COALESCE(SUM(amount), 0) AS total_paid
  FROM public.transactions
  WHERE transaction_type = 'income' AND category = 'monthly_fee'
  GROUP BY member_id
)
SELECT
  m.id AS member_id,
  m.full_name,
  m.phone_number,
  m.whatsapp_number,
  m.whatsapp_opt_out,
  m.monthly_fee_amount,
  m.fee_type,
  m.is_active,
  m.join_date,
  COALESCE(mfo.total_monthly_fees, 0) + COALESCE(efo.total_event_fees, 0) AS total_fees_owed,
  COALESCE(mp.total_paid, 0) + COALESCE(efo.total_event_paid, 0) AS total_paid,
  COALESCE(mp.total_paid, 0) + COALESCE(efo.total_event_paid, 0)
    - (COALESCE(mfo.total_monthly_fees, 0) + COALESCE(efo.total_event_fees, 0)) AS current_balance,
  EXTRACT(YEAR FROM AGE(DATE_TRUNC('month', CURRENT_DATE), DATE_TRUNC('month', m.join_date))) * 12 +
  EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', CURRENT_DATE), DATE_TRUNC('month', m.join_date))) + 1
    AS months_since_join
FROM public.members m
LEFT JOIN monthly_fees_owed mfo ON mfo.member_id = m.id
LEFT JOIN event_fees_owed efo ON efo.member_id = m.id
LEFT JOIN member_payments mp ON mp.member_id = m.id;

-- ---------------------------------------------------------------------
-- 2. reminder_status enum
-- ---------------------------------------------------------------------
CREATE TYPE public.reminder_status AS ENUM (
  'pending_review',
  'approved',
  'sent',
  'failed',
  'dismissed'
);

-- ---------------------------------------------------------------------
-- 3. payment_reminders queue
-- ---------------------------------------------------------------------
CREATE TABLE public.payment_reminders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  period_year         INTEGER NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  period_month        INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  amount_owed         NUMERIC NOT NULL,
  whatsapp_number     TEXT NULL,
  draft_message       TEXT NOT NULL,
  final_message       TEXT NULL,
  status              public.reminder_status NOT NULL DEFAULT 'pending_review',
  twilio_message_sid  TEXT NULL,
  failure_reason      TEXT NULL,
  sent_at             TIMESTAMP WITH TIME ZONE NULL,
  reviewed_by         UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (member_id, period_year, period_month)
);

CREATE INDEX idx_payment_reminders_period
  ON public.payment_reminders (period_year DESC, period_month DESC);

CREATE INDEX idx_payment_reminders_status
  ON public.payment_reminders (status);

CREATE TRIGGER update_payment_reminders_updated_at
  BEFORE UPDATE ON public.payment_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- RLS — same pattern as the budget tables
-- ---------------------------------------------------------------------
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Treasury viewers can read reminders"
  ON public.payment_reminders FOR SELECT
  USING (public.can_view(auth.uid()));

CREATE POLICY "Admins can insert reminders"
  ON public.payment_reminders FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update reminders"
  ON public.payment_reminders FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete reminders"
  ON public.payment_reminders FOR DELETE
  USING (public.is_admin(auth.uid()));
