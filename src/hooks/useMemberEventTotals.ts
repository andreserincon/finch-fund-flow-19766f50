/**
 * @file useMemberEventTotals.ts
 * @description Per-member event totals (amount owed / amount paid across all
 *   event_member_payments rows). Shared so the Panel, the Inicio overview, and
 *   the Members page all separate event debt from monthly capita the same way.
 *   Used by src/lib/attention to compute capita-only "requiere atención".
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MemberEventTotals } from '@/lib/attention';

export function useMemberEventTotals() {
  const query = useQuery({
    queryKey: ['member-event-data'],
    queryFn: async (): Promise<MemberEventTotals> => {
      const { data, error } = await supabase
        .from('event_member_payments')
        .select('member_id, amount_owed, amount_paid');
      if (error) throw error;
      const owed: Record<string, number> = {};
      const paid: Record<string, number> = {};
      data?.forEach((p) => {
        if (!p.member_id) return;
        owed[p.member_id] = (owed[p.member_id] || 0) + Number(p.amount_owed);
        paid[p.member_id] = (paid[p.member_id] || 0) + Number(p.amount_paid);
      });
      return { owed, paid };
    },
  });

  return {
    eventTotals: query.data ?? { owed: {}, paid: {} },
    isLoading: query.isLoading,
  };
}
