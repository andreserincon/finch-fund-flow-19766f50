import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface MemberUserInfo {
  member_id: string;
  user_id: string;
  email: string;
}

export function useMemberUsers() {
  const query = useQuery({
    queryKey: ['member_users'],
    queryFn: async () => {
      // Get profiles with member_id that are linked to auth users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, member_id')
        .not('member_id', 'is', null);

      if (profilesError) throw profilesError;

      // For each profile, we need to get the user email
      // Since we can't directly query auth.users, we'll use the current user's session
      // to determine the email (only works for the current user)
      // For other users, we'll need to store email in profiles or use an edge function
      
      const memberUserMap: Record<string, MemberUserInfo> = {};
      
      for (const profile of profiles || []) {
        if (profile.member_id) {
          // We store the user_id, but can't get email directly
          // The reset password function will need the email from another source
          memberUserMap[profile.member_id] = {
            member_id: profile.member_id,
            user_id: profile.id,
            email: '', // Will be fetched via edge function
          };
        }
      }

      return memberUserMap;
    },
  });

  return {
    memberUsers: query.data ?? {},
    isLoading: query.isLoading,
    hasMemberAccount: (memberId: string) => !!(query.data?.[memberId]),
  };
}
