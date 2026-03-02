/**
 * @file useCanViewTreasury.ts
 * @description Hook that determines whether the current user is
 *   allowed to view treasury data (dashboard, members, etc.).
 *   Permitted roles: treasurer, vm, admin, member.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useCanViewTreasury() {
  const { user } = useAuth();

  const { data: canView, isLoading } = useQuery({
    queryKey: ['can-view-treasury', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['treasurer', 'vm', 'admin', 'member'])
        .maybeSingle();

      if (error) {
        console.error('Error checking treasury access:', error);
        return false;
      }

      return !!data;
    },
    enabled: !!user?.id,
  });

  return { canViewTreasury: canView ?? false, isLoading };
}
