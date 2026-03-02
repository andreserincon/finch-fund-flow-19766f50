import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useIsMemberOnly() {
  const { user } = useAuth();

  const { data: isMemberOnly, isLoading } = useQuery({
    queryKey: ['is-member-only', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (error) return false;

      return data?.role === 'member';
    },
    enabled: !!user?.id,
  });

  return { isMemberOnly: isMemberOnly ?? false, isLoading };
}
