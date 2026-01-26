import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FeeType } from '@/lib/types';
import { toast } from 'sonner';

export interface MemberFeeTypeHistory {
  id: string;
  member_id: string;
  fee_type: FeeType;
  effective_from: string;
  created_at: string;
}

export function useMemberFeeTypeHistory(memberId?: string) {
  const queryClient = useQueryClient();

  const historyQuery = useQuery({
    queryKey: ['member_fee_type_history', memberId],
    queryFn: async () => {
      let query = supabase
        .from('member_fee_type_history')
        .select('*')
        .order('effective_from', { ascending: false });

      if (memberId) {
        query = query.eq('member_id', memberId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as MemberFeeTypeHistory[];
    },
  });

  const addHistory = useMutation({
    mutationFn: async (entry: {
      member_id: string;
      fee_type: FeeType;
      effective_from: string;
    }) => {
      const { data, error } = await supabase
        .from('member_fee_type_history')
        .insert(entry)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member_fee_type_history'] });
      queryClient.invalidateQueries({ queryKey: ['member_balances'] });
      toast.success('Fee type history entry added');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add entry: ${error.message}`);
    },
  });

  const updateHistory = useMutation({
    mutationFn: async ({
      id,
      fee_type,
      effective_from,
    }: {
      id: string;
      fee_type: FeeType;
      effective_from: string;
    }) => {
      const { data, error } = await supabase
        .from('member_fee_type_history')
        .update({ fee_type, effective_from })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member_fee_type_history'] });
      queryClient.invalidateQueries({ queryKey: ['member_balances'] });
      toast.success('Fee type history entry updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update entry: ${error.message}`);
    },
  });

  const deleteHistory = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('member_fee_type_history')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member_fee_type_history'] });
      queryClient.invalidateQueries({ queryKey: ['member_balances'] });
      toast.success('Fee type history entry deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete entry: ${error.message}`);
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
    addHistory,
    updateHistory,
    deleteHistory,
  };
}
