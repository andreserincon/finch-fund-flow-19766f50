/**
 * @file useCanManageUsers.ts
 * @description True when the current user may manage accesses (create users,
 *   assign roles, send reset links): an Administrator or a Venerable (vm). The
 *   real gate is the edge functions plus RLS; this drives the route guard and
 *   the UI affordances.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useCanManageUsers() {
  const { user } = useAuth();
  const { data: canManageUsers, isLoading } = useQuery({
    queryKey: ['can-manage-users', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['admin', 'vm'])
        .limit(1)
        .maybeSingle();
      if (error) {
        console.error('Error checking user-management access:', error);
        return false;
      }
      return !!data;
    },
    enabled: !!user?.id,
  });
  return { canManageUsers: canManageUsers ?? false, isLoading };
}
