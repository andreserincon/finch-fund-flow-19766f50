/**
 * @file useEventOverview.ts
 * @description Aggregates the data shown on the Event Overview page:
 *   the event itself, all participant payments (members + guests), and
 *   the transactions tagged with this event_id. KPIs are computed in
 *   the consumer to keep this hook a pure read.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ExtraordinaryExpense } from '@/hooks/useExtraordinaryExpenses';
import { EventMemberPayment, Transaction } from '@/lib/types';

export interface EventOverviewData {
  event: ExtraordinaryExpense | null;
  payments: EventMemberPayment[];
  transactions: (Transaction & { member: { id: string; full_name: string } | null })[];
}

export function useEventOverview(eventId?: string) {
  return useQuery<EventOverviewData>({
    queryKey: ['event-overview', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      if (!eventId) {
        return { event: null, payments: [], transactions: [] };
      }

      const [eventRes, paymentsRes, txRes] = await Promise.all([
        supabase.from('extraordinary_expenses').select('*').eq('id', eventId).maybeSingle(),
        supabase
          .from('event_member_payments')
          .select('*, member:members(id, full_name)')
          .eq('event_id', eventId)
          .order('created_at'),
        supabase
          .from('transactions')
          .select('*, member:members(id, full_name)')
          .eq('event_id', eventId)
          .order('transaction_date', { ascending: false }),
      ]);

      if (eventRes.error) throw eventRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (txRes.error) throw txRes.error;

      return {
        event: (eventRes.data as ExtraordinaryExpense | null) ?? null,
        payments: (paymentsRes.data ?? []) as EventMemberPayment[],
        transactions: (txRes.data ?? []) as (Transaction & {
          member: { id: string; full_name: string } | null;
        })[],
      };
    },
  });
}
