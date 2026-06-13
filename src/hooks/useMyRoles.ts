/**
 * @file useMyRoles.ts
 * @description Single source for the CURRENT user's own roles. Fetches the
 *   signed-in user's user_roles rows ONCE under a shared, cached query key so
 *   the permission hooks (useIsAdmin, useIsSuperAdmin, useCanManageUsers,
 *   useIsBibliotecario, useCanViewTreasury, useIsMemberOnly) all derive from one
 *   request instead of each firing its own user_roles SELECT on every screen.
 *   Roles rarely change within a session, so this caches for several minutes.
 *   The real privacy boundary is Postgres RLS; these hooks only drive UI gating
 *   and route guards. (Not to be confused with useUserRoles, which lists ALL
 *   users for the admin user-management page.)
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useMyRoles() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['my-roles', user?.id],
    queryFn: async (): Promise<string[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      if (error) {
        console.error('Error fetching current user roles:', error);
        return [];
      }
      return (data ?? []).map((r) => r.role as string);
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return { roles: data ?? [], isLoading };
}
