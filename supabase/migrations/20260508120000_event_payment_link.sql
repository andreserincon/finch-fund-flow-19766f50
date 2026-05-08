-- =====================================================================
-- Link event payments end-to-end with cash-flow transactions
-- =====================================================================
-- Before this migration, marking a participant as "pagado" bumped
-- event_member_payments.amount_paid but never created a transactions
-- row, so bank/lodge balances and the Dashboard never saw the inflow.
-- Worse, there was no way to attribute a transaction to a specific
-- guest (only members could be FK'd via member_id).
--
-- Fix:
--   1. Add transactions.event_member_payment_id (nullable FK) so a
--      transaction can point at the exact participant row — member OR
--      guest. The existing event_id stays for category-only events
--      (e.g. event_expense without a specific participant).
--   2. Add a small CHECK to keep the data consistent: when
--      event_member_payment_id is set, category MUST be event_payment.
--   3. Index the new column so the EventOverview can pull
--      "transactions for this participant" efficiently.
-- =====================================================================

ALTER TABLE public.transactions
  ADD COLUMN event_member_payment_id UUID NULL
    REFERENCES public.event_member_payments(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_event_member_payment_id
  ON public.transactions (event_member_payment_id)
  WHERE event_member_payment_id IS NOT NULL;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_event_member_payment_requires_payment_category
  CHECK (
    event_member_payment_id IS NULL
    OR category = 'event_payment'
  );
