-- =====================================================================
-- Events as first-class entities
-- =====================================================================
-- Two changes to make events fully usable in the treasury workflow:
--
-- 1. transactions.event_id (nullable FK -> extraordinary_expenses)
--    Lets a transaction be tagged with the specific event it belongs to,
--    enabling per-event income/expense aggregation. Only valid when the
--    category is one of the event-related enum values.
--
-- 2. event_member_payments now supports non-member guests
--    member_id becomes nullable; new guest_name + guest_phone columns
--    are introduced. Exactly one of (member_id, guest_name) must be set.
--    Partial unique indexes replace the previous (event_id, member_id)
--    UNIQUE constraint to keep both members and guests deduplicated
--    within an event.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. transactions.event_id
-- ---------------------------------------------------------------------
ALTER TABLE public.transactions
  ADD COLUMN event_id UUID NULL
    REFERENCES public.extraordinary_expenses(id) ON DELETE SET NULL;

CREATE INDEX idx_transactions_event_id
  ON public.transactions (event_id)
  WHERE event_id IS NOT NULL;

-- Ensure event_id is only set on event-related transactions.
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_event_id_requires_event_category
  CHECK (
    event_id IS NULL
    OR category IN ('event_expense', 'event_payment')
  );

-- ---------------------------------------------------------------------
-- 2. event_member_payments — guest support
-- ---------------------------------------------------------------------

-- Drop the old composite UNIQUE so member_id can be nullable without
-- breaking the constraint semantics.
ALTER TABLE public.event_member_payments
  DROP CONSTRAINT IF EXISTS event_member_payments_event_id_member_id_key;

ALTER TABLE public.event_member_payments
  ALTER COLUMN member_id DROP NOT NULL,
  ADD COLUMN guest_name TEXT NULL,
  ADD COLUMN guest_phone TEXT NULL;

-- Exactly one of member_id or guest_name must be present.
ALTER TABLE public.event_member_payments
  ADD CONSTRAINT event_member_payments_member_or_guest_required
  CHECK (
    (member_id IS NOT NULL AND guest_name IS NULL)
    OR (member_id IS NULL AND guest_name IS NOT NULL)
  );

-- Re-create uniqueness as two partial indexes.
CREATE UNIQUE INDEX uniq_event_member_payments_member
  ON public.event_member_payments (event_id, member_id)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX uniq_event_member_payments_guest
  ON public.event_member_payments (event_id, lower(guest_name))
  WHERE guest_name IS NOT NULL;
