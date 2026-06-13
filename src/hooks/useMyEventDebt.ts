/**
 * @file useMyEventDebt.ts
 * @description The signed-in member's own unpaid event total, via the
 *   get_my_event_debt() Postgres function (SECURITY DEFINER). Members can read
 *   their own event_member_payments rows but NOT the parent extraordinary_expenses,
 *   so the client-side join used for staff returns nothing for them. The function
 *   sums only the caller's own active-event debt (scoped by get_user_member_id),
 *   so it leaks no other member's data. Returns 0 until the SQL is applied.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useMyEventDebt(enabled = true) {
  return useQuery({
    queryKey: ['my-event-debt'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('get_my_event_debt');
      if (error) {
        console.warn('get_my_event_debt unavailable:', error.message);
        return 0;
      }
      return Number(data ?? 0);
    },
    enabled,
  });
}
