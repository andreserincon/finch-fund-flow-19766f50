-- Drop and recreate the member_balances view to show fee type from history
DROP VIEW IF EXISTS public.member_balances;

CREATE VIEW public.member_balances
WITH (security_invoker = on)
AS
SELECT 
  m.id AS member_id,
  m.full_name,
  m.phone_number,
  m.monthly_fee_amount,
  COALESCE(
    public.get_member_fee_type_for_month(m.id, date_trunc('month', CURRENT_DATE)::DATE),
    m.fee_type
  ) AS fee_type,
  m.is_active,
  m.join_date,
  COALESCE(monthly_fees_owed.total, 0) + COALESCE(event_fees.total_owed, 0) AS total_fees_owed,
  COALESCE(payments.total, 0) AS total_paid,
  COALESCE(payments.total, 0) - (COALESCE(monthly_fees_owed.total, 0) + COALESCE(event_fees.total_owed, 0)) AS current_balance,
  EXTRACT(YEAR FROM age(date_trunc('month', CURRENT_DATE), date_trunc('month', m.join_date))) * 12 +
  EXTRACT(MONTH FROM age(date_trunc('month', CURRENT_DATE), date_trunc('month', m.join_date))) AS months_since_join
FROM public.members m
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(mf.amount), 0) AS total
  FROM public.monthly_fees mf
  WHERE mf.year_month >= date_trunc('month', m.join_date)::DATE
    AND mf.year_month <= date_trunc('month', CURRENT_DATE)::DATE
    AND mf.fee_type = public.get_member_fee_type_for_month(m.id, mf.year_month)
) monthly_fees_owed ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(amount_owed), 0) AS total_owed
  FROM public.event_member_payments
  WHERE member_id = m.id
) event_fees ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(amount), 0) AS total
  FROM public.transactions
  WHERE member_id = m.id
    AND transaction_type = 'income'
    AND category IN ('monthly_fee', 'event_payment')
) payments ON TRUE;