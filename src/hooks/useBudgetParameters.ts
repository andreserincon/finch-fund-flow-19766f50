/**
 * @file useBudgetParameters.ts
 * @description Fetches and updates the 1:1 parameters row for a scenario.
 *   The row is auto-created by the `trg_budget_scenarios_create_parameters`
 *   trigger whenever a scenario is inserted, so this hook only needs to
 *   read and update — not insert.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BudgetScenarioParameters } from '@/lib/budget-types';
import { toast } from 'sonner';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

export function useBudgetParameters(scenarioId: string | null | undefined) {
  const queryClient = useQueryClient();
  const enabled = !!scenarioId;

  const paramsQuery = useQuery({
    queryKey: ['budget_parameters', scenarioId],
    enabled,
    queryFn: async () => {
      if (!scenarioId) return null;
      const { data, error } = await db
        .from('budget_scenario_parameters')
        .select('*')
        .eq('budget_scenario_id', scenarioId)
        .maybeSingle();
      if (error) throw error;
      return (data as BudgetScenarioParameters) ?? null;
    },
  });

  const updateParameters = useMutation({
    mutationFn: async (
      updates: Partial<
        Pick<
          BudgetScenarioParameters,
          | 'inflation_percent'
          | 'membership_growth_percent'
          | 'extraordinary_income_multiplier'
        >
      >,
    ) => {
      if (!scenarioId) throw new Error('No scenario selected');
      const { data, error } = await db
        .from('budget_scenario_parameters')
        .update(updates)
        .eq('budget_scenario_id', scenarioId)
        .select()
        .single();
      if (error) throw error;
      return data as BudgetScenarioParameters;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['budget_parameters', scenarioId],
      });
      toast.success('Parámetros actualizados');
    },
    onError: (error: Error) => {
      toast.error(`Error al actualizar parámetros: ${error.message}`);
    },
  });

  return {
    parameters: paramsQuery.data ?? null,
    isLoading: paramsQuery.isLoading,
    error: paramsQuery.error,
    updateParameters,
  };
}
