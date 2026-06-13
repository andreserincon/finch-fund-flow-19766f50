/**
 * @file useIsMemberOnly.ts
 * @description Hook that checks if the current user has only the
 *   'member' role (read-only treasury access). Member-only users
 *   can view dashboards but cannot modify financial data.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useIsMemberOnly() {
  const { user } = useAuth();

  const { data: isMemberOnly, isLoading } = useQuery({
    queryKey: ['is-member-only', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;

      // Fail closed: read ALL role rows. With .single() a user with two roles
      // errored and silently un-scoped to staff. Member-only means they have at
      // least one role and every role is 'member'. The real privacy boundary is
      // Postgres RLS; this hook only drives UI gating.
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (error || !data || data.length === 0) return false;

      return data.every((r) => r.role === 'member');
    },
    enabled: !!user?.id,
  });

  return { isMemberOnly: isMemberOnly ?? false, isLoading };
}
