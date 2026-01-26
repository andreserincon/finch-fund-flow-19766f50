import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface EventMemberPayment {
  id: string;
  event_id: string;
  member_id: string;
  amount_owed: number;
  amount_paid: number;
  created_at: string;
  updated_at: string;
}

export function useEventMemberPayments(eventId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['event-member-payments', eventId],
    queryFn: async () => {
      let query = supabase
        .from('event_member_payments')
        .select('*, member:members(id, full_name)')
        .order('created_at');
      
      if (eventId) {
        query = query.eq('event_id', eventId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  const createPaymentsForAllMembers = useMutation({
    mutationFn: async ({ eventId, amountPerMember }: { eventId: string; amountPerMember: number }) => {
      // Get all active members
      const { data: members, error: membersError } = await supabase
        .from('members')
        .select('id')
        .eq('is_active', true);

      if (membersError) throw membersError;
      if (!members || members.length === 0) {
        throw new Error('No active members found');
      }

      // Create payment records for all members
      const paymentRecords = members.map(member => ({
        event_id: eventId,
        member_id: member.id,
        amount_owed: amountPerMember,
        amount_paid: 0,
      }));

      const { error } = await supabase
        .from('event_member_payments')
        .insert(paymentRecords);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-member-payments'] });
      queryClient.invalidateQueries({ queryKey: ['member-balances'] });
      toast({ title: 'Event fees assigned to all members' });
    },
    onError: (error) => {
      toast({ title: 'Failed to assign fees', description: error.message, variant: 'destructive' });
    },
  });

  const updatePayment = useMutation({
    mutationFn: async ({ id, amount_paid }: { id: string; amount_paid: number }) => {
      const { error } = await supabase
        .from('event_member_payments')
        .update({ amount_paid })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-member-payments'] });
      queryClient.invalidateQueries({ queryKey: ['member-balances'] });
      toast({ title: 'Payment updated' });
    },
    onError: (error) => {
      toast({ title: 'Failed to update payment', description: error.message, variant: 'destructive' });
    },
  });

  const deletePaymentsForEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from('event_member_payments')
        .delete()
        .eq('event_id', eventId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-member-payments'] });
      queryClient.invalidateQueries({ queryKey: ['member-balances'] });
    },
    onError: (error) => {
      toast({ title: 'Failed to delete payments', description: error.message, variant: 'destructive' });
    },
  });

  return {
    payments,
    isLoading,
    createPaymentsForAllMembers,
    updatePayment,
    deletePaymentsForEvent,
  };
}
