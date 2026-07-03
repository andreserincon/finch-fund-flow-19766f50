-- Make the member_balances view's DISPLAYED fee_type come from the fee-type
-- history, matching how total_fees_owed is already computed.
--
-- Background
-- ----------
-- A member's cápita type lives in two places:
--   1. members.fee_type            — edited via the "Editar Miembro" form
--   2. member_fee_type_history     — edited via the "Historial de tipo de
--                                    cápita" dialog (the source of truth)
-- The history dialog (FeeTypeHistoryDialog / useMemberFeeTypeHistory) writes
-- ONLY to member_fee_type_history; it never updates members.fee_type.
--
-- The live view already computes total_fees_owed per month from the history
-- (mf.fee_type = get_member_fee_type_for_month(m.id, mf.year_month)) and even
-- stops charging after inactive_since. But it still exposes the raw
-- members.fee_type as the view's fee_type column. That stale column is what the
-- UI reads for the type badge AND what the client status logic (attention.ts)
-- feeds into fees[member.fee_type]. So a member corrected to Estándar in the
-- history kept showing "Solidaria" and, because the current-month fee used in
-- the demorado/impago split came from the solidarity schedule while the owed
-- total was standard-based, was misflagged "Demorado".
--
-- Fix
-- ---
-- Change ONLY the exposed fee_type column to read from the history via
-- get_member_fee_type_for_month (falling back to members.fee_type when a member
-- has no history row at all). Everything else — columns, order, the
-- inactive_since-aware owed join, lodge_office/inactive_since — is reproduced
-- verbatim from the current live definition so CREATE OR REPLACE succeeds and
-- behavior is otherwise unchanged.
CREATE OR REPLACE VIEW public.member_balances
WITH (security_invoker = on)
AS
WITH monthly_fees_owed AS (
  SELECT
    m.id AS member_id,
    COALESCE(sum(mf.amount), 0::numeric) AS total_monthly_fees
  FROM members m
  LEFT JOIN monthly_fees mf
    ON mf.fee_type = get_member_fee_type_for_month(m.id, mf.year_month)
   AND mf.year_month >= date_trunc('month'::text, m.join_date::timestamp with time zone)
   AND mf.year_month <= LEAST(
         date_trunc('month'::text, CURRENT_DATE::timestamp with time zone),
         COALESCE(date_trunc('month'::text, m.inactive_since::timestamp with time zone) - '1 mon'::interval,
                  date_trunc('month'::text, CURRENT_DATE::timestamp with time zone))
       )
  GROUP BY m.id
), event_fees_owed AS (
  SELECT
    event_member_payments.member_id,
    COALESCE(sum(event_member_payments.amount_owed), 0::numeric) AS total_event_fees,
    COALESCE(sum(event_member_payments.amount_paid), 0::numeric) AS total_event_paid
  FROM event_member_payments
  WHERE event_member_payments.member_id IS NOT NULL
  GROUP BY event_member_payments.member_id
), member_payments AS (
  SELECT
    transactions.member_id,
    COALESCE(sum(transactions.amount), 0::numeric) AS total_paid
  FROM transactions
  WHERE transactions.transaction_type = 'income'::transaction_type
    AND transactions.category = 'monthly_fee'::transaction_category
  GROUP BY transactions.member_id
)
SELECT
  m.id AS member_id,
  m.full_name,
  m.phone_number,
  m.whatsapp_number,
  m.whatsapp_opt_out,
  m.monthly_fee_amount,
  -- CHANGED: derive the displayed type from the fee-type history (matching how
  -- total_fees_owed is already computed) instead of the raw members.fee_type.
  COALESCE(
    get_member_fee_type_for_month(m.id, date_trunc('month'::text, CURRENT_DATE::timestamp with time zone)::date),
    m.fee_type
  ) AS fee_type,
  m.is_active,
  m.join_date,
  COALESCE(mfo.total_monthly_fees, 0::numeric) + COALESCE(efo.total_event_fees, 0::numeric) AS total_fees_owed,
  COALESCE(mp.total_paid, 0::numeric) + COALESCE(efo.total_event_paid, 0::numeric) AS total_paid,
  COALESCE(mp.total_paid, 0::numeric) + COALESCE(efo.total_event_paid, 0::numeric)
    - (COALESCE(mfo.total_monthly_fees, 0::numeric) + COALESCE(efo.total_event_fees, 0::numeric)) AS current_balance,
  EXTRACT(year FROM age(date_trunc('month'::text, CURRENT_DATE::timestamp with time zone), date_trunc('month'::text, m.join_date::timestamp with time zone))) * 12::numeric
    + EXTRACT(month FROM age(date_trunc('month'::text, CURRENT_DATE::timestamp with time zone), date_trunc('month'::text, m.join_date::timestamp with time zone)))
    + 1::numeric AS months_since_join,
  m.lodge_office,
  m.inactive_since
FROM members m
LEFT JOIN monthly_fees_owed mfo ON mfo.member_id = m.id
LEFT JOIN event_fees_owed efo ON efo.member_id = m.id
LEFT JOIN member_payments mp ON mp.member_id = m.id;
