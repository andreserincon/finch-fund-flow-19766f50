/**
 * @file useEventParticipations.ts
 * @description All member event participations (across all events) with their
 *   event name, charge date and installments. Only active events with an
 *   outstanding balance are returned. Feeds the reminder detail (event cuotas).
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EventParticipation } from '@/lib/reminderDetail';

export interface MemberEventParticipation extends EventParticipation {
  member_id: string;
}

// `installments` is newer than the generated types, so use an untyped client.
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const db = supabase as any;

export function useEventParticipations() {
  const query = useQuery({
    queryKey: ['event-participations-all'],
    queryFn: async (): Promise<MemberEventParticipation[]> => {
      const { data, error } = await db
        .from('event_member_payments')
        .select('member_id, amount_owed, amount_paid, installments, extraordinary_expenses!inner(name, charge_from_date, is_active)');
      if (error) throw error;
      /* eslint-disable @typescript-eslint/no-explicit-any */
      return (data ?? [])
        .filter((r: any) => r.member_id && r.extraordinary_expenses?.is_active && Number(r.amount_owed) > Number(r.amount_paid))
        .map((r: any) => ({
          member_id: r.member_id as string,
          event_name: r.extraordinary_expenses?.name ?? 'Evento',
          charge_from_date: r.extraordinary_expenses?.charge_from_date ?? null,
          installments: Number(r.installments) || 1,
          amount_owed: Number(r.amount_owed),
          amount_paid: Number(r.amount_paid),
        }));
      /* eslint-enable @typescript-eslint/no-explicit-any */
    },
  });

  return {
    participations: query.data ?? [],
    isLoading: query.isLoading,
  };
}
