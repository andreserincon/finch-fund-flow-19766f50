import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FeeType } from '@/lib/types';

export interface MemberFeeTypeHistory {
  id: string;
  member_id: string;
  fee_type: FeeType;
  effective_from: string;
  created_at: string;
}

export function useMemberFeeTypeHistory() {
  const historyQuery = useQuery({
    queryKey: ['member_fee_type_history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_fee_type_history')
        .select('*')
        .order('effective_from', { ascending: false });

      if (error) throw error;
      return data as MemberFeeTypeHistory[];
    },
  });

  // Get the fee type for a member at a specific month
  const getFeeTypeForMonth = (memberId: string, monthKey: string): FeeType | null => {
    if (!historyQuery.data) return null;

    const memberHistory = historyQuery.data.filter(h => h.member_id === memberId);
    
    // Find the most recent fee type that is effective on or before the given month
    for (const record of memberHistory) {
      if (record.effective_from <= monthKey) {
        return record.fee_type;
      }
    }

    return null;
  };

  return {
    history: historyQuery.data ?? [],
    isLoading: historyQuery.isLoading,
    error: historyQuery.error,
    getFeeTypeForMonth,
  };
}
