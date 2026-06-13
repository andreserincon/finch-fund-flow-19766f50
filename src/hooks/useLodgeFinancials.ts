/**
 * @file useLodgeFinancials.ts
 * @description Lodge-wide account balances via the get_lodge_financials()
 *   Postgres function (SECURITY DEFINER). Used for members, whose RLS scopes
 *   their raw transaction reads to their own rows, so they cannot compute the
 *   lodge totals client-side. The function returns ONLY the three account
 *   balances (no per-member data). Returns null until the SQL is applied.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LodgeFinancials {
  bank_balance: number;
  great_lodge_balance: number;
  savings_balance: number;
}

export function useLodgeFinancials(enabled = true) {
  return useQuery({
    queryKey: ['lodge-financials'],
    queryFn: async (): Promise<LodgeFinancials | null> => {
      const { data, error } = await supabase.rpc('get_lodge_financials');
      if (error) {
        // Function not yet applied, or no access: fall back to no aggregate.
        console.warn('get_lodge_financials unavailable:', error.message);
        return null;
      }
      const row = Array.isArray(data) ? data[0] : data;
      return (row as LodgeFinancials | undefined) ?? null;
    },
    enabled,
  });
}
