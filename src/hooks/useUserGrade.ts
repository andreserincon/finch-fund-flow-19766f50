/**
 * @file useUserGrade.ts
 * @description Hook that resolves the current user's masonic grade
 *   by looking up their profile → member → masonic_grade chain.
 *   Defaults to 'aprendiz' if no profile/member is linked.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { MasonicGrade } from '@/lib/library-types';

export function useUserGrade() {
  const { user } = useAuth();

  const { data: grade, isLoading } = useQuery({
    queryKey: ['user-grade', user?.id],
    queryFn: async (): Promise<MasonicGrade> => {
      if (!user?.id) return 'aprendiz';

      // Step 1: get the member_id from the profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('member_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.member_id) return 'aprendiz';

      // Step 2: get the masonic_grade from the member
      const { data: member } = await supabase
        .from('members')
        .select('masonic_grade')
        .eq('id', profile.member_id)
        .maybeSingle();

      return (member?.masonic_grade as MasonicGrade) || 'aprendiz';
    },
    enabled: !!user?.id,
  });

  return { grade: grade ?? 'aprendiz' as MasonicGrade, isLoading };
}
