-- Create event_member_payments table to track member obligations and payments for events
CREATE TABLE public.event_member_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.extraordinary_expenses(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  amount_owed NUMERIC NOT NULL,
  amount_paid NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(event_id, member_id)
);

-- Enable RLS
ALTER TABLE public.event_member_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Treasurers can view event member payments"
  ON public.event_member_payments FOR SELECT
  USING (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can insert event member payments"
  ON public.event_member_payments FOR INSERT
  WITH CHECK (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can update event member payments"
  ON public.event_member_payments FOR UPDATE
  USING (is_treasurer(auth.uid()));

CREATE POLICY "Treasurers can delete event member payments"
  ON public.event_member_payments FOR DELETE
  USING (is_treasurer(auth.uid()));

CREATE POLICY "Members can view own event payments"
  ON public.event_member_payments FOR SELECT
  USING (member_id = get_user_member_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_event_member_payments_updated_at
  BEFORE UPDATE ON public.event_member_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Drop and recreate member_balances view to include event fees
DROP VIEW IF EXISTS public.member_balances;

CREATE VIEW public.member_balances AS
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
  m.monthly_fee_amount,
  m.fee_type,
  m.is_active,
  m.join_date,
  COALESCE(mfo.total_monthly_fees, 0) + COALESCE(efo.total_event_fees, 0) AS total_fees_owed,
  COALESCE(mp.total_paid, 0) + COALESCE(efo.total_event_paid, 0) AS total_paid,
  COALESCE(mp.total_paid, 0) + COALESCE(efo.total_event_paid, 0) - (COALESCE(mfo.total_monthly_fees, 0) + COALESCE(efo.total_event_fees, 0)) AS current_balance,
  EXTRACT(YEAR FROM AGE(DATE_TRUNC('month', CURRENT_DATE), DATE_TRUNC('month', m.join_date))) * 12 +
  EXTRACT(MONTH FROM AGE(DATE_TRUNC('month', CURRENT_DATE), DATE_TRUNC('month', m.join_date))) + 1 AS months_since_join
FROM public.members m
LEFT JOIN monthly_fees_owed mfo ON mfo.member_id = m.id
LEFT JOIN event_fees_owed efo ON efo.member_id = m.id
LEFT JOIN member_payments mp ON mp.member_id = m.id;