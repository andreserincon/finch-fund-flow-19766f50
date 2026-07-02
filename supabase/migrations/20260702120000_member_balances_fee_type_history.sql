-- Restore fee-type-history awareness to the member_balances view.
--
-- Background
-- ----------
-- A member's cápita type lives in two places:
--   1. members.fee_type            — edited via the "Editar Miembro" form
--   2. member_fee_type_history     — edited via the "Historial de tipo de
--                                    cápita" dialog (source of truth, per
--                                    migration 20260126142606)
-- The history dialog (FeeTypeHistoryDialog / useMemberFeeTypeHistory) writes
-- ONLY to member_fee_type_history; it never updates members.fee_type. The
-- balances view was therefore designed to derive the effective type from the
-- history via get_member_fee_type_for_month().
--
-- Regression
-- ----------
-- The WhatsApp migration (20260507121000_whatsapp_reminders.sql) rebuilt
-- member_balances with CREATE OR REPLACE to add the whatsapp_number /
-- whatsapp_opt_out columns, and in doing so reverted the view to read the raw
-- members.fee_type column for BOTH the exposed fee_type and the owed-fees
-- join. That silently dropped the history-awareness: a member corrected to
-- Estándar through the history dialog kept showing "Solidaria" and being
-- charged at the stale members.fee_type schedule, which pushed their capita
-- balance negative and flagged them "Demorado".
--
-- Fix
-- ---
-- Rebuild the view so the effective fee type once again comes from
-- member_fee_type_history (via get_member_fee_type_for_month), while keeping
-- every column and the event accounting introduced by the WhatsApp migration.
-- The column set and order are identical, so CREATE OR REPLACE preserves RLS
-- and downstream consumers.
CREATE OR REPLACE VIEW public.member_balances AS
WITH monthly_fees_owed AS (
  SELECT
    m.id AS member_id,
    COALESCE(SUM(mf.amount), 0) AS total_monthly_fees
  FROM public.members m
  LEFT JOIN public.monthly_fees mf ON
    -- Match each month against the member's effective type for THAT month,
    -- taken from the fee-type history rather than the current column.
    mf.fee_type = public.get_member_fee_type_for_month(m.id, mf.year_month) AND
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
  -- Effective type for the current month, from the history. Fall back to the
  -- column only when a member somehow has no history row at all.
  COALESCE(
    public.get_member_fee_type_for_month(m.id, DATE_TRUNC('month', CURRENT_DATE)::DATE),
    m.fee_type
  ) AS fee_type,
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
