-- Drop the insecure view
DROP VIEW IF EXISTS public.users_with_roles;

-- Create a secure function to get users with roles (only for admins)
CREATE OR REPLACE FUNCTION public.get_users_with_roles()
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    role app_role,
    role_assigned_at TIMESTAMP WITH TIME ZONE,
    member_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
      au.id as user_id,
      au.email::TEXT,
      ur.role,
      ur.created_at as role_assigned_at,
      p.member_id
  FROM auth.users au
  LEFT JOIN public.user_roles ur ON au.id = ur.user_id
  LEFT JOIN public.profiles p ON au.id = p.id
  WHERE is_admin(auth.uid())
$$;