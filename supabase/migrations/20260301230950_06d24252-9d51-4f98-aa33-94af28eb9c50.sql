
-- Update is_admin to include admin role
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('treasurer', 'admin')
  )
$$;

-- Update can_view to include admin role
CREATE OR REPLACE FUNCTION public.can_view(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('treasurer', 'vm', 'admin')
  )
$$;

-- Update is_bibliotecario to include admin role
CREATE OR REPLACE FUNCTION public.is_bibliotecario(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('bibliotecario', 'admin')
  )
$$;

-- Update is_treasurer to include admin role
CREATE OR REPLACE FUNCTION public.is_treasurer(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('treasurer', 'admin')
  )
$$;
