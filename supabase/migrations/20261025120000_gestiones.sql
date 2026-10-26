-- Fase 1 de la transicion de Tesorero: modelo de gestiones.
-- Registra cada gestion (periodo) con sus fechas y oficiales (Tesorero y
-- Venerable) y expone is_date_locked(), que sera el ancla del bloqueo de
-- periodos cerrados en la Fase 2. No cambia ningun comportamiento de escritura
-- existente todavia. Idempotente: se puede correr mas de una vez.

-- Tabla de gestiones
CREATE TABLE IF NOT EXISTS public.gestiones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  tesorero_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  vm_member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  closed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- A lo sumo una gestion abierta a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS gestiones_one_open
  ON public.gestiones (estado)
  WHERE estado = 'abierta';

-- updated_at automatico (reusa la funcion existente del esquema).
DROP TRIGGER IF EXISTS update_gestiones_updated_at ON public.gestiones;
CREATE TRIGGER update_gestiones_updated_at
  BEFORE UPDATE ON public.gestiones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.gestiones ENABLE ROW LEVEL SECURITY;

-- Lectura: staff de tesoreria (treasurer, vm, admin).
DROP POLICY IF EXISTS "gestiones_select" ON public.gestiones;
CREATE POLICY "gestiones_select"
  ON public.gestiones FOR SELECT
  TO authenticated
  USING (public.can_view(auth.uid()));

-- Escritura (crear, cerrar, editar, borrar): gobernanza = Administrador o
-- Venerable, igual que Accesos y Roles. El Tesorero NO administra gestiones.
DROP POLICY IF EXISTS "gestiones_insert" ON public.gestiones;
CREATE POLICY "gestiones_insert"
  ON public.gestiones FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vm'));

DROP POLICY IF EXISTS "gestiones_update" ON public.gestiones;
CREATE POLICY "gestiones_update"
  ON public.gestiones FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vm'));

DROP POLICY IF EXISTS "gestiones_delete" ON public.gestiones;
CREATE POLICY "gestiones_delete"
  ON public.gestiones FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vm'));

-- Ancla del bloqueo (Fase 2): una fecha esta bloqueada si existe una gestion
-- abierta y la fecha es anterior al inicio de esa gestion (pertenece a un
-- periodo ya cerrado). Sin gestion abierta, nada esta bloqueado (arranque).
CREATE OR REPLACE FUNCTION public.is_date_locked(_d DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.gestiones
    WHERE estado = 'abierta'
      AND _d < fecha_inicio
  )
$$;
