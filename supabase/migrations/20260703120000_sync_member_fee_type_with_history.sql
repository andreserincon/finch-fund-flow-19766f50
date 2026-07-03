-- Keep members.fee_type and member_fee_type_history in sync (both directions).
--
-- Why
-- ---
-- The cápita type lives in two places that could drift apart:
--   * members.fee_type          — edited via the "Editar Miembro" form
--   * member_fee_type_history   — edited via the "Historial de tipo de cápita"
--                                 dialog (the source of truth)
-- Existing triggers already cover COLUMN -> HISTORY (insert_initial_fee_type_
-- history on member INSERT, track_fee_type_change on member UPDATE). The
-- reverse direction was missing: editing the history dialog never refreshed
-- members.fee_type, so a member corrected there kept a stale column value.
--
-- This migration:
--   1. Makes the column->history trigger conflict-safe and recursion-guarded.
--   2. Adds a history->column trigger that refreshes members.fee_type to the
--      member's current effective type whenever the history changes.
--   3. Reconciles rows that have already drifted.
--
-- A transaction-local GUC (app.sync_fee_type) breaks the potential trigger
-- loop: while the history->column sync is updating members.fee_type, the
-- column->history trigger sees the flag and does nothing.

-- 1. Column -> history: guard against the sync loop and never fail on a second
--    edit within the same month (upsert instead of a plain insert).
CREATE OR REPLACE FUNCTION public.track_fee_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- The change came from the history->column sync below; don't echo it back.
  IF current_setting('app.sync_fee_type', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF OLD.fee_type IS DISTINCT FROM NEW.fee_type THEN
    INSERT INTO public.member_fee_type_history (member_id, fee_type, effective_from)
    VALUES (NEW.id, NEW.fee_type, date_trunc('month', CURRENT_DATE)::DATE)
    ON CONFLICT (member_id, effective_from)
    DO UPDATE SET fee_type = EXCLUDED.fee_type;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. History -> column: refresh the member's CURRENT effective type onto
--    members.fee_type after any history insert/update/delete. SECURITY DEFINER
--    so it can update members regardless of who edited the history (e.g. a VM
--    with rights on history but not on members).
CREATE OR REPLACE FUNCTION public.sync_member_fee_type_from_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id UUID := COALESCE(NEW.member_id, OLD.member_id);
  v_effective public.fee_type;
BEGIN
  v_effective := public.get_member_fee_type_for_month(
    v_member_id, date_trunc('month', CURRENT_DATE)::DATE
  );

  -- No history applies to the current month (e.g. the last row was deleted):
  -- leave the column untouched rather than nulling it.
  IF v_effective IS NULL THEN
    RETURN NULL;
  END IF;

  -- Flag the update so track_fee_type_change() skips inserting a redundant
  -- history row. is_local = true scopes it to this transaction.
  PERFORM set_config('app.sync_fee_type', 'on', true);
  UPDATE public.members
    SET fee_type = v_effective
    WHERE id = v_member_id
      AND fee_type IS DISTINCT FROM v_effective;
  PERFORM set_config('app.sync_fee_type', 'off', true);

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS sync_member_fee_type_from_history ON public.member_fee_type_history;
CREATE TRIGGER sync_member_fee_type_from_history
AFTER INSERT OR UPDATE OR DELETE ON public.member_fee_type_history
FOR EACH ROW
EXECUTE FUNCTION public.sync_member_fee_type_from_history();

-- 3. One-time reconciliation of members whose column has already drifted from
--    the current effective history (e.g. corrected only via the dialog). The
--    column->history trigger is disabled for this correction so it does not
--    manufacture history rows.
ALTER TABLE public.members DISABLE TRIGGER member_fee_type_change_trigger;

UPDATE public.members m
SET fee_type = eff.effective
FROM (
  SELECT id,
         public.get_member_fee_type_for_month(id, date_trunc('month', CURRENT_DATE)::DATE) AS effective
  FROM public.members
) eff
WHERE m.id = eff.id
  AND eff.effective IS NOT NULL
  AND m.fee_type IS DISTINCT FROM eff.effective;

ALTER TABLE public.members ENABLE TRIGGER member_fee_type_change_trigger;
