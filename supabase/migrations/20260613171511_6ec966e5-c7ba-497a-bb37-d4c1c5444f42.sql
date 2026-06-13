
CREATE OR REPLACE FUNCTION public.prevent_role_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only admins may change profile role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_role_self_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_role_self_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_role_self_escalation();

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  (id = auth.uid() AND role = 'member')
  OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS "Members can view own report snapshots" ON public.report_member_snapshots;
CREATE POLICY "Members can view own report snapshots"
ON public.report_member_snapshots
FOR SELECT
TO authenticated
USING (member_id = public.get_user_member_id(auth.uid()));

DROP POLICY IF EXISTS "Treasurers can delete report files" ON storage.objects;
CREATE POLICY "Treasurers can delete report files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'reports' AND public.is_treasurer(auth.uid()));
