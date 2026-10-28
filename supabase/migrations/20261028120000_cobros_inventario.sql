-- Cobros pendientes (cuentas por cobrar) + Inventario de medallas
-- Idempotente: se puede correr mas de una vez sin romper nada.

-- ── Enums (con guarda por si ya existen) ─────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.charge_category AS ENUM
    ('medalla','ritual','derecho_iniciacion','derecho_exaltacion','derecho_aumento','otro');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.charge_currency AS ENUM ('ARS','USD');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.charge_status AS ENUM ('pending','partial','paid','cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.medal_movement_type AS ENUM ('in','out');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.medal_movement_reason AS ENUM
    ('compra','ajuste_entrada','entrega_con_cargo','iniciacion','ajuste_salida');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Tabla: cobros pendientes (cuentas por cobrar) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.member_charges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   uuid NOT NULL REFERENCES public.members(id) ON DELETE RESTRICT,
  category    public.charge_category NOT NULL DEFAULT 'otro',
  note        text,
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  amount_paid numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  currency    public.charge_currency NOT NULL DEFAULT 'ARS',
  charge_date date NOT NULL DEFAULT CURRENT_DATE,
  status      public.charge_status NOT NULL DEFAULT 'pending',
  paid_date   date,
  created_by  uuid DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_charges_member_idx ON public.member_charges(member_id);
CREATE INDEX IF NOT EXISTS member_charges_status_idx ON public.member_charges(status);

-- ── Tabla: pagos de un cobro (permite pagos parciales) ───────────────────────
CREATE TABLE IF NOT EXISTS public.member_charge_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  charge_id      uuid NOT NULL REFERENCES public.member_charges(id) ON DELETE CASCADE,
  amount         numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_date   date NOT NULL DEFAULT CURRENT_DATE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_by     uuid DEFAULT auth.uid(),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_charge_payments_charge_idx ON public.member_charge_payments(charge_id);

-- ── Tabla: movimientos del inventario de medallas ────────────────────────────
CREATE TABLE IF NOT EXISTS public.medal_inventory_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type public.medal_movement_type NOT NULL,
  quantity      integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  movement_date date NOT NULL DEFAULT CURRENT_DATE,
  member_id     uuid REFERENCES public.members(id) ON DELETE SET NULL,
  reason        public.medal_movement_reason NOT NULL,
  charge_id     uuid REFERENCES public.member_charges(id) ON DELETE SET NULL,
  note          text,
  created_by    uuid DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS medal_movements_member_idx ON public.medal_inventory_movements(member_id);
CREATE INDEX IF NOT EXISTS medal_movements_charge_idx ON public.medal_inventory_movements(charge_id);

-- ── Vista: stock actual de medallas (entradas menos salidas) ─────────────────
CREATE OR REPLACE VIEW public.medal_stock AS
SELECT COALESCE(SUM(CASE WHEN movement_type = 'in' THEN quantity ELSE -quantity END), 0)::int AS stock
FROM public.medal_inventory_movements;

-- ── Recalcular amount_paid / status del cobro al cambiar sus pagos ───────────
CREATE OR REPLACE FUNCTION public.recompute_member_charge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid   uuid := COALESCE(NEW.charge_id, OLD.charge_id);
  total numeric(14,2);
  paid  numeric(14,2);
BEGIN
  SELECT amount INTO total FROM public.member_charges WHERE id = cid;
  SELECT COALESCE(SUM(amount), 0) INTO paid FROM public.member_charge_payments WHERE charge_id = cid;
  UPDATE public.member_charges
  SET amount_paid = paid,
      status = (CASE WHEN paid >= total THEN 'paid' WHEN paid > 0 THEN 'partial' ELSE 'pending' END)::public.charge_status,
      paid_date = CASE WHEN paid >= total THEN COALESCE(paid_date, CURRENT_DATE) ELSE NULL END,
      updated_at = now()
  WHERE id = cid AND status <> 'cancelled';
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS recompute_charge_on_payment ON public.member_charge_payments;
CREATE TRIGGER recompute_charge_on_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.member_charge_payments
  FOR EACH ROW EXECUTE FUNCTION public.recompute_member_charge();

-- ── updated_at en member_charges ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_member_charges ON public.member_charges;
CREATE TRIGGER set_updated_at_member_charges
  BEFORE UPDATE ON public.member_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Auditoria (misma funcion que el resto de las tablas de dinero) ───────────
DROP TRIGGER IF EXISTS audit_member_charges ON public.member_charges;
CREATE TRIGGER audit_member_charges
  AFTER INSERT OR UPDATE OR DELETE ON public.member_charges
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_member_charge_payments ON public.member_charge_payments;
CREATE TRIGGER audit_member_charge_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.member_charge_payments
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

DROP TRIGGER IF EXISTS audit_medal_inventory_movements ON public.medal_inventory_movements;
CREATE TRIGGER audit_medal_inventory_movements
  AFTER INSERT OR UPDATE OR DELETE ON public.medal_inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.member_charges            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_charge_payments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medal_inventory_movements ENABLE ROW LEVEL SECURITY;

-- member_charges: tesoreria (y VM) escriben; staff ve todo; el hermano ve los suyos.
DROP POLICY IF EXISTS "charges select staff or own" ON public.member_charges;
CREATE POLICY "charges select staff or own" ON public.member_charges
  FOR SELECT USING (can_view(auth.uid()) OR member_id = get_user_member_id(auth.uid()));
DROP POLICY IF EXISTS "charges write staff" ON public.member_charges;
CREATE POLICY "charges write staff" ON public.member_charges
  FOR ALL USING (is_treasurer(auth.uid()) OR has_role(auth.uid(), 'vm'))
  WITH CHECK (is_treasurer(auth.uid()) OR has_role(auth.uid(), 'vm'));

-- member_charge_payments: mismo criterio (el hermano ve los pagos de sus cargos).
DROP POLICY IF EXISTS "charge payments select staff or own" ON public.member_charge_payments;
CREATE POLICY "charge payments select staff or own" ON public.member_charge_payments
  FOR SELECT USING (
    can_view(auth.uid())
    OR charge_id IN (SELECT id FROM public.member_charges WHERE member_id = get_user_member_id(auth.uid()))
  );
DROP POLICY IF EXISTS "charge payments write staff" ON public.member_charge_payments;
CREATE POLICY "charge payments write staff" ON public.member_charge_payments
  FOR ALL USING (is_treasurer(auth.uid()) OR has_role(auth.uid(), 'vm'))
  WITH CHECK (is_treasurer(auth.uid()) OR has_role(auth.uid(), 'vm'));

-- medal_inventory_movements: solo staff (lectura y escritura).
DROP POLICY IF EXISTS "medal movements select staff" ON public.medal_inventory_movements;
CREATE POLICY "medal movements select staff" ON public.medal_inventory_movements
  FOR SELECT USING (can_view(auth.uid()));
DROP POLICY IF EXISTS "medal movements write staff" ON public.medal_inventory_movements;
CREATE POLICY "medal movements write staff" ON public.medal_inventory_movements
  FOR ALL USING (is_treasurer(auth.uid()) OR has_role(auth.uid(), 'vm'))
  WITH CHECK (is_treasurer(auth.uid()) OR has_role(auth.uid(), 'vm'));
