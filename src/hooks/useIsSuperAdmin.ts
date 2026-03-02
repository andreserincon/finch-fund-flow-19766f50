/**
 * @file useIsSuperAdmin.ts
 * @description Hook that checks whether the current user has the
 *   top-level 'admin' role. Super-admins can manage users and
 *   access the /user-management and /admin/members routes.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useIsSuperAdmin() {
  const { user } = useAuth();

  const { data: isSuperAdmin, isLoading } = useQuery({
    queryKey: ['is-super-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (error) {
        console.error('Error checking super admin status:', error);
        return false;
      }

      return !!data;
    },
    enabled: !!user?.id,
  });

  return { isSuperAdmin: isSuperAdmin ?? false, isLoading };
}
