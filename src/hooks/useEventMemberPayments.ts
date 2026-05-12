/**
 * @file useEventMemberPayments.ts
 * @description Hook for managing per-participant payment tracking within
 *   an extraordinary expense event. Supports both members (member_id set)
 *   and non-member guests (guest_name set). Exactly one of member_id or
 *   guest_name is non-null per row, enforced by a CHECK constraint.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { EventMemberPayment } from '@/lib/types';

/**
 * Re-exported for backwards compatibility with existing imports.
 * Prefer `EventMemberPayment` from `@/lib/types` in new code.
 */
export type { EventMemberPayment };

/**
 * @param eventId - Filter payments by this event. Query is disabled if undefined.
 */
export function useEventMemberPayments(eventId?: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  /** Fetch payments for the selected event (with member names) */
  const { data: payments = [], isLoading } = useQuery<EventMemberPayment[]>({
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
      return data as EventMemberPayment[];
    },
    enabled: !!eventId,
  });

  /** Assign fee records to ALL active members for a given event */
  const createPaymentsForAllMembers = useMutation({
    mutationFn: async ({ eventId, amountPerMember }: { eventId: string; amountPerMember: number }) => {
      const { data: members, error: membersError } = await supabase
        .from('members')
        .select('id')
        .eq('is_active', true);

      if (membersError) throw membersError;
      if (!members || members.length === 0) throw new Error('No active members found');

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
      queryClient.invalidateQueries({ queryKey: ['event-overview'] });
      queryClient.invalidateQueries({ queryKey: ['member-balances'] });
      toast({ title: 'Capita asignada a todos los miembros' });
    },
    onError: (error) => {
      toast({ title: 'Error al asignar capita', description: error.message, variant: 'destructive' });
    },
  });

  /** Update a single payment record (amount_paid, amount_owed, or guest_phone) */
  const updatePayment = useMutation({
    mutationFn: async ({
      id,
      amount_paid,
      amount_owed,
      guest_phone,
    }: {
      id: string;
      amount_paid?: number;
      amount_owed?: number;
      guest_phone?: string | null;
    }) => {
      const updateData: Partial<{ amount_paid: number; amount_owed: number; guest_phone: string | null }> = {};
      if (amount_paid !== undefined) updateData.amount_paid = amount_paid;
      if (amount_owed !== undefined) updateData.amount_owed = amount_owed;
      if (guest_phone !== undefined) updateData.guest_phone = guest_phone;

      const { error } = await supabase
        .from('event_member_payments')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-member-payments'] });
      queryClient.invalidateQueries({ queryKey: ['event-overview'] });
      queryClient.invalidateQueries({ queryKey: ['member-balances'] });
      queryClient.invalidateQueries({ queryKey: ['member-event-debts'] });
      toast({ title: 'Pago actualizado' });
    },
    onError: (error) => {
      toast({ title: 'Error al actualizar el pago', description: error.message, variant: 'destructive' });
    },
  });

  /** Add a single member to an event */
  const addMemberToEvent = useMutation({
    mutationFn: async ({ eventId, memberId, amountOwed }: { eventId: string; memberId: string; amountOwed: number }) => {
      const { error } = await supabase
        .from('event_member_payments')
        .insert({
          event_id: eventId,
          member_id: memberId,
          amount_owed: amountOwed,
          amount_paid: 0,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-member-payments'] });
      queryClient.invalidateQueries({ queryKey: ['event-overview'] });
      queryClient.invalidateQueries({ queryKey: ['member-balances'] });
      queryClient.invalidateQueries({ queryKey: ['member-event-debts'] });
      toast({ title: 'Miembro agregado al evento' });
    },
    onError: (error) => {
      toast({ title: 'Error al agregar miembro', description: error.message, variant: 'destructive' });
    },
  });

  /** Add a non-member guest (invitee) to an event */
  const addGuestToEvent = useMutation({
    mutationFn: async ({
      eventId,
      guestName,
      guestPhone,
      amountOwed,
    }: {
      eventId: string;
      guestName: string;
      guestPhone?: string | null;
      amountOwed: number;
    }) => {
      const { error } = await supabase
        .from('event_member_payments')
        .insert({
          event_id: eventId,
          member_id: null,
          guest_name: guestName,
          guest_phone: guestPhone || null,
          amount_owed: amountOwed,
          amount_paid: 0,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-member-payments'] });
      queryClient.invalidateQueries({ queryKey: ['event-overview'] });
      toast({ title: 'Invitado agregado al evento' });
    },
    onError: (error) => {
      toast({ title: 'Error al agregar invitado', description: error.message, variant: 'destructive' });
    },
  });

  /** Remove a single participant (member or guest) by payment row id */
  const removeMemberFromEvent = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase
        .from('event_member_payments')
        .delete()
        .eq('id', paymentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-member-payments'] });
      queryClient.invalidateQueries({ queryKey: ['event-overview'] });
      queryClient.invalidateQueries({ queryKey: ['member-balances'] });
      queryClient.invalidateQueries({ queryKey: ['member-event-debts'] });
      toast({ title: 'Participante removido del evento' });
    },
    onError: (error) => {
      toast({ title: 'Error al remover participante', description: error.message, variant: 'destructive' });
    },
  });

  /** Delete ALL payment records for a given event */
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
      queryClient.invalidateQueries({ queryKey: ['event-overview'] });
      queryClient.invalidateQueries({ queryKey: ['member-balances'] });
    },
    onError: (error) => {
      toast({ title: 'Error al eliminar pagos', description: error.message, variant: 'destructive' });
    },
  });

  return {
    payments,
    isLoading,
    createPaymentsForAllMembers,
    updatePayment,
    addMemberToEvent,
    addGuestToEvent,
    removeMemberFromEvent,
    deletePaymentsForEvent,
  };
}
