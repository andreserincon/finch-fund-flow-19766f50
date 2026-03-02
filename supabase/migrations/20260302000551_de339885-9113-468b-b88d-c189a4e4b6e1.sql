
DROP FUNCTION IF EXISTS public.get_users_with_roles();

CREATE OR REPLACE FUNCTION public.get_users_with_roles()
 RETURNS TABLE(user_id uuid, email text, role app_role, role_assigned_at timestamp with time zone, member_id uuid, member_name text, masonic_grade masonic_grade)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
      au.id as user_id,
      au.email::TEXT,
      ur.role,
      ur.created_at as role_assigned_at,
      p.member_id,
      m.full_name as member_name,
      m.masonic_grade
  FROM auth.users au
  LEFT JOIN public.user_roles ur ON au.id = ur.user_id
  LEFT JOIN public.profiles p ON au.id = p.id
  LEFT JOIN public.members m ON p.member_id = m.id
  WHERE is_admin(auth.uid())
$$;
