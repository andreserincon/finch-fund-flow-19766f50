/**
 * @file useIsAdmin.ts
 * @description Hook that checks whether the current user has admin-level
 *   privileges (role = 'treasurer' or 'admin' in user_roles table).
 *   Used to gate write-access routes like /log-payment, /log-expense.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useIsAdmin() {
  const { user } = useAuth();

  const { data: isAdmin, isLoading } = useQuery({
    queryKey: ['is-admin', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['treasurer', 'admin'])
        .maybeSingle();

      if (error) {
        console.error('Error checking admin status:', error);
        return false;
      }

      return !!data;
    },
    enabled: !!user?.id,
  });

  return { isAdmin: isAdmin ?? false, isLoading };
}
