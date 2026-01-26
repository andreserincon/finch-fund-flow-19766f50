-- Recreate member_balances view with security_invoker to fix security definer warning
DROP VIEW IF EXISTS public.member_balances;

CREATE VIEW public.member_balances
WITH (security_invoker = on) AS
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