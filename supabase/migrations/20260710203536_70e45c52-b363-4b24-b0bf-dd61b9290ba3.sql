
CREATE OR REPLACE FUNCTION public.prevent_member_id_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.member_id IS DISTINCT FROM OLD.member_id AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins may change profile member_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_member_id_self_change ON public.profiles;
CREATE TRIGGER profiles_prevent_member_id_self_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_member_id_self_change();

CREATE OR REPLACE FUNCTION public.can_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('treasurer', 'vm', 'admin')
  )
$$;

DROP POLICY IF EXISTS "Members can view monthly fees" ON public.monthly_fees;
CREATE POLICY "Linked members can view monthly fees"
ON public.monthly_fees
FOR SELECT
USING (
  is_staff_or_vm(auth.uid())
  OR get_user_member_id(auth.uid()) IS NOT NULL
);

DROP POLICY IF EXISTS "Members can view active extraordinary expenses" ON public.extraordinary_expenses;
CREATE POLICY "Linked members can view active extraordinary expenses"
ON public.extraordinary_expenses
FOR SELECT
USING (
  is_active = true
  AND get_user_member_id(auth.uid()) IS NOT NULL
);
