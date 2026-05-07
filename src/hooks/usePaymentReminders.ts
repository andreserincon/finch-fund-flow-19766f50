/**
 * @file usePaymentReminders.ts
 * @description CRUD + send hook for the payment_reminders queue. The
 *   actual sending happens in the `send-whatsapp-reminder` edge function;
 *   this hook just invokes it and refreshes the cache afterwards.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PaymentReminder, ReminderStatus } from '@/lib/types';
import { toast } from 'sonner';

export interface UsePaymentRemindersArgs {
  year: number;
  month: number;
}

export function usePaymentReminders({ year, month }: UsePaymentRemindersArgs) {
  const queryClient = useQueryClient();
  const queryKey = ['payment-reminders', year, month] as const;

  const remindersQuery = useQuery<PaymentReminder[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_reminders')
        .select('*, member:members(id, full_name, whatsapp_number)')
        .eq('period_year', year)
        .eq('period_month', month)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as PaymentReminder[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-reminders'] });
  };

  /** Update a reminder's draft message before sending */
  const updateDraft = useMutation({
    mutationFn: async ({ id, draft_message }: { id: string; draft_message: string }) => {
      const { error } = await supabase
        .from('payment_reminders')
        .update({ draft_message })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Borrador actualizado');
    },
    onError: (err: Error) => {
      toast.error(`No se pudo actualizar el borrador: ${err.message}`);
    },
  });

  /** Dismiss a reminder without sending */
  const dismissReminder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('payment_reminders')
        .update({ status: 'dismissed' as ReminderStatus, failure_reason: null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Recordatorio descartado');
    },
    onError: (err: Error) => {
      toast.error(`No se pudo descartar: ${err.message}`);
    },
  });

  /** Send one or more reminders via the edge function */
  const sendReminders = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-reminder', {
        body: { reminder_ids: ids },
      });
      if (error) throw error;
      return data as { results: Array<{ reminder_id: string; status: 'sent' | 'failed'; error?: string }> };
    },
    onSuccess: (data) => {
      invalidate();
      const sent = data?.results?.filter((r) => r.status === 'sent').length ?? 0;
      const failed = data?.results?.filter((r) => r.status === 'failed').length ?? 0;
      if (sent && !failed) toast.success(`${sent} recordatorio(s) enviado(s)`);
      else if (sent && failed) toast.warning(`${sent} enviados, ${failed} fallaron`);
      else if (failed) toast.error(`${failed} recordatorio(s) fallaron`);
    },
    onError: (err: Error) => {
      toast.error(`Error al enviar: ${err.message}`);
    },
  });

  /** Trigger the queue function manually (force=1) */
  const buildQueueNow = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('queue-overdue-reminders', {
        body: {},
        headers: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Cola de recordatorios actualizada');
    },
    onError: (err: Error) => {
      toast.error(`No se pudo construir la cola: ${err.message}`);
    },
  });

  return {
    reminders: remindersQuery.data ?? [],
    isLoading: remindersQuery.isLoading,
    error: remindersQuery.error,
    updateDraft,
    dismissReminder,
    sendReminders,
    buildQueueNow,
  };
}
