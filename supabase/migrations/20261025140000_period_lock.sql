-- Fase 2 de la transicion de Tesorero: bloqueo de periodos cerrados.
--
-- Regla: el periodo ABIERTO (fecha >= inicio de la gestion abierta) lo escribe
-- el Tesorero (o el Administrador). Un periodo CERRADO (fecha anterior al inicio
-- de la gestion abierta) solo lo pueden ajustar el Administrador o el Venerable;
-- el Tesorero no. El Venerable NO escribe el periodo abierto (sigue como hoy),
-- solo los cerrados. Sin gestion abierta, nada esta bloqueado (arranque).
--
-- Se aplica a las tablas de movimiento de dinero con fecha propia: transactions,
-- account_transfers, loans y loan_payments. event_member_payments (sin fecha) y
-- monthly_fees (parametro, year_month) quedan fuera de esta fase.
--
-- Idempotente: se puede correr mas de una vez. Las politicas de SELECT no se
-- tocan (solo se reemplazan las de INSERT/UPDATE/DELETE).

-- 1) Funcion central con la regla (una sola fuente de verdad).
CREATE OR REPLACE FUNCTION public.can_write_period(_user_id uuid, _d date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ( NOT public.is_date_locked(_d) AND public.is_treasurer(_user_id) )
    OR
    ( public.is_date_locked(_d) AND ( public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'vm') ) )
$$;

-- 2) Reemplazar las politicas de ESCRITURA de cada tabla. El DO borra TODAS las
--    de INSERT/UPDATE/DELETE (cualquier nombre) y luego se crean las nuevas con
--    la regla sobre la columna de fecha de esa tabla.

-- transactions (transaction_date)
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transactions' AND cmd IN ('INSERT','UPDATE','DELETE')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.transactions', pol.policyname); END LOOP;
END $$;
CREATE POLICY "tx_insert_period" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK ( public.can_write_period(auth.uid(), transaction_date) );
CREATE POLICY "tx_update_period" ON public.transactions FOR UPDATE TO authenticated
  USING ( public.can_write_period(auth.uid(), transaction_date) )
  WITH CHECK ( public.can_write_period(auth.uid(), transaction_date) );
CREATE POLICY "tx_delete_period" ON public.transactions FOR DELETE TO authenticated
  USING ( public.can_write_period(auth.uid(), transaction_date) );

-- account_transfers (transfer_date)
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'account_transfers' AND cmd IN ('INSERT','UPDATE','DELETE')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.account_transfers', pol.policyname); END LOOP;
END $$;
CREATE POLICY "transfer_insert_period" ON public.account_transfers FOR INSERT TO authenticated
  WITH CHECK ( public.can_write_period(auth.uid(), transfer_date) );
CREATE POLICY "transfer_update_period" ON public.account_transfers FOR UPDATE TO authenticated
  USING ( public.can_write_period(auth.uid(), transfer_date) )
  WITH CHECK ( public.can_write_period(auth.uid(), transfer_date) );
CREATE POLICY "transfer_delete_period" ON public.account_transfers FOR DELETE TO authenticated
  USING ( public.can_write_period(auth.uid(), transfer_date) );

-- loans (loan_date)
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'loans' AND cmd IN ('INSERT','UPDATE','DELETE')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.loans', pol.policyname); END LOOP;
END $$;
CREATE POLICY "loan_insert_period" ON public.loans FOR INSERT TO authenticated
  WITH CHECK ( public.can_write_period(auth.uid(), loan_date) );
CREATE POLICY "loan_update_period" ON public.loans FOR UPDATE TO authenticated
  USING ( public.can_write_period(auth.uid(), loan_date) )
  WITH CHECK ( public.can_write_period(auth.uid(), loan_date) );
CREATE POLICY "loan_delete_period" ON public.loans FOR DELETE TO authenticated
  USING ( public.can_write_period(auth.uid(), loan_date) );

-- loan_payments (payment_date)
DO $$ DECLARE pol record; BEGIN
  FOR pol IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'loan_payments' AND cmd IN ('INSERT','UPDATE','DELETE')
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.loan_payments', pol.policyname); END LOOP;
END $$;
CREATE POLICY "loanpay_insert_period" ON public.loan_payments FOR INSERT TO authenticated
  WITH CHECK ( public.can_write_period(auth.uid(), payment_date) );
CREATE POLICY "loanpay_update_period" ON public.loan_payments FOR UPDATE TO authenticated
  USING ( public.can_write_period(auth.uid(), payment_date) )
  WITH CHECK ( public.can_write_period(auth.uid(), payment_date) );
CREATE POLICY "loanpay_delete_period" ON public.loan_payments FOR DELETE TO authenticated
  USING ( public.can_write_period(auth.uid(), payment_date) );
