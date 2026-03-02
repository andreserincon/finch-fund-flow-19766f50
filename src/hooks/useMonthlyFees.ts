/**
 * @file useMonthlyFees.ts
 * @description Hook for managing monthly fee configuration.
 *   Each month can have a different fee amount per fee type
 *   (standard vs solidarity). The `upsert` mutation uses an
 *   ON CONFLICT clause so fees can be set or updated idempotently.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FeeType } from '@/lib/types';
import { toast } from 'sonner';

/** Shape of a row in the `monthly_fees` table */
export interface MonthlyFee {
  id: string;
  /** Format: "YYYY-MM-01" */
  year_month: string;
  fee_type: FeeType;
  /** Lodge-level fee amount */
  amount: number;
  /** Great Lodge standard portion (nullable) */
  gl_standard_amount: number | null;
  /** Great Lodge solidarity portion (nullable) */
  gl_solidarity_amount: number | null;
  created_at: string;
  updated_at: string;
}

export function useMonthlyFees() {
  const queryClient = useQueryClient();

  /** All monthly fee records ordered newest-first */
  const monthlyFeesQuery = useQuery({
    queryKey: ['monthly_fees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_fees')
        .select('*')
        .order('year_month', { ascending: false });

      if (error) throw error;
      return data as MonthlyFee[];
    },
  });

  /** Quick lookup: current month fee amounts by type */
  const currentMonthFeesQuery = useQuery({
    queryKey: ['monthly_fees', 'current'],
    queryFn: async () => {
      const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
      const { data, error } = await supabase
        .from('monthly_fees')
        .select('*')
        .eq('year_month', currentMonth);

      if (error) throw error;

      // Build a fee_type → amount map
      const feeMap: Record<FeeType, number> = { standard: 0, solidarity: 0 };
      data?.forEach((fee) => {
        feeMap[fee.fee_type as FeeType] = fee.amount;
      });

      return feeMap;
    },
  });

  /** Create or update a monthly fee (idempotent upsert) */
  const upsertMonthlyFee = useMutation({
    mutationFn: async (fee: {
      year_month: string;
      fee_type: FeeType;
      amount: number;
      gl_standard_amount?: number | null;
      gl_solidarity_amount?: number | null;
    }) => {
      const { data, error } = await supabase
        .from('monthly_fees')
        .upsert(fee, { onConflict: 'year_month,fee_type' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly_fees'] });
      toast.success('Monthly fee updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update monthly fee: ${error.message}`);
    },
  });

  /** Helper: look up the fee amount for a specific month + type */
  const getFeeForMonth = (yearMonth: string, feeType: FeeType): number => {
    const fee = monthlyFeesQuery.data?.find(
      (f) => f.year_month === yearMonth && f.fee_type === feeType
    );
    return fee?.amount ?? 0;
  };

  return {
    monthlyFees: monthlyFeesQuery.data ?? [],
    currentMonthFees: currentMonthFeesQuery.data ?? { standard: 0, solidarity: 0 },
    isLoading: monthlyFeesQuery.isLoading || currentMonthFeesQuery.isLoading,
    error: monthlyFeesQuery.error || currentMonthFeesQuery.error,
    upsertMonthlyFee,
    getFeeForMonth,
  };
}
