-- Fase 3 de la transicion de Tesorero: bitacora / auditoria de cambios.
--
-- Registra cada INSERT/UPDATE/DELETE sobre las tablas de movimiento de dinero y
-- de parametros, con quien lo hizo (auth.uid(); null = proceso con service role,
-- p. ej. una edge function o el generador de reportes) y el antes/despues en
-- JSONB. Solo el Administrador o el Venerable pueden leer la bitacora; nadie la
-- escribe a mano (solo el trigger, que corre como definer). Idempotente.

-- Tabla de bitacora.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  row_id UUID,
  action TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  actor_user_id UUID,
  old_data JSONB,
  new_data JSONB,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_changed_at_idx ON public.audit_log (changed_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_table_idx ON public.audit_log (table_name);

-- RLS: solo lectura para Administrador o Venerable. No hay politica de escritura,
-- asi que ningun cliente puede insertar/editar/borrar; solo el trigger (definer).
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_select" ON public.audit_log;
CREATE POLICY "audit_select" ON public.audit_log FOR SELECT TO authenticated
  USING ( public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vm') );

-- Funcion de trigger generica.
CREATE OR REPLACE FUNCTION public.log_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD); v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL; v_new := to_jsonb(NEW);
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_log (table_name, row_id, action, actor_user_id, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    (COALESCE(v_new, v_old) ->> 'id')::uuid,
    TG_OP,
    auth.uid(),
    v_old,
    v_new
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Adjuntar el trigger a las tablas de movimiento y parametros.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transactions','account_transfers','loans','loan_payments','event_member_payments',
    'monthly_fees','extraordinary_expenses','budget_scenario_parameters','organization_settings','members'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.log_audit()', t);
  END LOOP;
END $$;
