/**
 * @file useMembers.ts
 * @description CRUD hook for the `members` and `member_balances` tables.
 *   Provides reactive queries (React Query) and mutation helpers for
 *   adding, updating, and deleting lodge members.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Member, MemberBalance, FeeType } from '@/lib/types';
import { toast } from 'sonner';

export function useMembers() {
  const queryClient = useQueryClient();

  /* ── Queries ── */

  /** Fetch all members ordered alphabetically */
  const membersQuery = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('full_name');
      if (error) throw error;
      return data as Member[];
    },
  });

  /** Fetch the computed member_balances view (includes payment status) */
  const memberBalancesQuery = useQuery({
    queryKey: ['member_balances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_balances')
        .select('*')
        .order('full_name');
      if (error) throw error;
      return data as MemberBalance[];
    },
  });

  /* ── Mutations ── */

  /** Insert a new member */
  const addMember = useMutation({
    mutationFn: async (member: {
      full_name: string;
      phone_number: string;
      monthly_fee_amount: number;
      fee_type: FeeType;
      join_date: string;
    }) => {
      const { data, error } = await supabase
        .from('members')
        .insert(member)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['member_balances'] });
      toast.success('Member added successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to add member: ${error.message}`);
    },
  });

  /** Update an existing member by ID */
  const updateMember = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Member> & { id: string }) => {
      const { data, error } = await supabase
        .from('members')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['member_balances'] });
      toast.success('Member updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update member: ${error.message}`);
    },
  });

  /** Delete a member by ID */
  const deleteMember = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('members').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      queryClient.invalidateQueries({ queryKey: ['member_balances'] });
      toast.success('Member deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete member: ${error.message}`);
    },
  });

  return {
    members: membersQuery.data ?? [],
    memberBalances: memberBalancesQuery.data ?? [],
    isLoading: membersQuery.isLoading || memberBalancesQuery.isLoading,
    error: membersQuery.error || memberBalancesQuery.error,
    addMember,
    updateMember,
    deleteMember,
  };
}
