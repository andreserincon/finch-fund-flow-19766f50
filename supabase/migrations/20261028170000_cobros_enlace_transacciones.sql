-- Cobros pendientes: enlazar los pagos con las transacciones de forma real.
-- Antes, al eliminar la transaccion el pago quedaba huerfano (ON DELETE SET
-- NULL) y el cobro seguia figurando pagado. Y al editar el monto de la
-- transaccion, el pago no se ajustaba. Esto lo corrige. Idempotente: se puede
-- correr mas de una vez sin romper nada.
--
-- NOTA: la limpieza del pago huerfano de una prueba anterior NO va aca (seria
-- un DELETE de datos); se corre a mano una sola vez (ver la conversacion).

-- 1) Al ELIMINAR la transaccion, se elimina el pago enlazado. El trigger
--    recompute_member_charge (AFTER DELETE en member_charge_payments) revierte
--    entonces amount_paid / status del cobro a su estado pendiente/parcial.
ALTER TABLE public.member_charge_payments
  DROP CONSTRAINT IF EXISTS member_charge_payments_transaction_id_fkey;
ALTER TABLE public.member_charge_payments
  ADD CONSTRAINT member_charge_payments_transaction_id_fkey
  FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;

-- 2) Al EDITAR el monto o la fecha de la transaccion, se refleja en el pago
--    enlazado; el trigger recompute_member_charge recalcula el cobro.
CREATE OR REPLACE FUNCTION public.sync_charge_payment_from_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.member_charge_payments
  SET amount = NEW.amount,
      payment_date = NEW.transaction_date
  WHERE transaction_id = NEW.id
    AND NEW.amount > 0
    AND (amount IS DISTINCT FROM NEW.amount
         OR payment_date IS DISTINCT FROM NEW.transaction_date);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS sync_charge_payment_on_tx_update ON public.transactions;
CREATE TRIGGER sync_charge_payment_on_tx_update
  AFTER UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.sync_charge_payment_from_transaction();
