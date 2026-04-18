/**
 * @file useBudgets.ts
 * @description CRUD hook for `budget_scenarios`. Also surfaces a single
 *   "active scenario for the given year" convenience and exposes
 *   mutations that activate / rename / delete a scenario.
 *
 *   Because the budget tables are not yet in the auto-generated
 *   Supabase type set, the supabase client is cast to `any` at the
 *   boundary; all outward-facing values are strictly typed via the
 *   BudgetScenario interface.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BudgetScenario } from '@/lib/budget-types';
import { toast } from 'sonner';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

export function useBudgets(year?: number) {
  const queryClient = useQueryClient();

  /* ── Query: all scenarios (optionally filtered by year) ── */
  const scenariosQuery = useQuery({
    queryKey: ['budget_scenarios', year ?? 'all'],
    queryFn: async () => {
      let q = db
        .from('budget_scenarios')
        .select('*')
        .order('year', { ascending: false })
        .order('revision_number', { ascending: true })
        .order('created_at', { ascending: true });

      if (typeof year === 'number') {
        q = q.eq('year', year);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data as BudgetScenario[]) ?? [];
    },
  });

  const scenarios: BudgetScenario[] = scenariosQuery.data ?? [];
  const activeScenario =
    scenarios.find((s) => s.is_active) ?? scenarios[0] ?? null;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['budget_scenarios'] });
    queryClient.invalidateQueries({ queryKey: ['budget_lines'] });
    queryClient.invalidateQueries({ queryKey: ['budget_parameters'] });
  };

  /* ── Mutation: create a new scenario (optionally copy lines) ── */
  const createScenario = useMutation({
    mutationFn: async (input: {
      year: number;
      scenario_name: string;
      notes?: string | null;
      /** If provided, copy all budget_lines from this scenario to the new one. */
      copy_from_scenario_id?: string | null;
    }) => {
      const { data: user } = await supabase.auth.getUser();
      const created_by = user.user?.id ?? null;

      const { data: inserted, error: insertErr } = await db
        .from('budget_scenarios')
        .insert({
          year: input.year,
          scenario_name: input.scenario_name,
          notes: input.notes ?? null,
          created_by,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      const newScenario = inserted as BudgetScenario;

      // Optionally clone lines from an existing scenario.
      if (input.copy_from_scenario_id) {
        const { data: sourceLines, error: srcErr } = await db
          .from('budget_lines')
          .select('month, account, transaction_type, category, budgeted_amount')
          .eq('budget_scenario_id', input.copy_from_scenario_id);

        if (srcErr) throw srcErr;

        if (sourceLines && sourceLines.length > 0) {
          const toInsert = sourceLines.map((l: Record<string, unknown>) => ({
            ...l,
            budget_scenario_id: newScenario.id,
          }));
          const { error: copyErr } = await db
            .from('budget_lines')
            .insert(toInsert);
          if (copyErr) throw copyErr;
        }

        // Also copy parameters. The trigger created an empty row, so we update it.
        const { data: srcParams, error: paramErr } = await db
          .from('budget_scenario_parameters')
          .select('inflation_percent, membership_growth_percent, extraordinary_income_multiplier')
          .eq('budget_scenario_id', input.copy_from_scenario_id)
          .maybeSingle();

        if (paramErr) throw paramErr;
        if (srcParams) {
          const { error: updErr } = await db
            .from('budget_scenario_parameters')
            .update(srcParams)
            .eq('budget_scenario_id', newScenario.id);
          if (updErr) throw updErr;
        }
      }

      return newScenario;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Escenario creado correctamente');
    },
    onError: (error: Error) => {
      toast.error(`Error al crear escenario: ${error.message}`);
    },
  });

  /* ── Mutation: update basic scenario fields ── */
  const updateScenario = useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<BudgetScenario> & { id: string }) => {
      const { data, error } = await db
        .from('budget_scenarios')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as BudgetScenario;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Escenario actualizado');
    },
    onError: (error: Error) => {
      toast.error(`Error al actualizar escenario: ${error.message}`);
    },
  });

  /* ── Mutation: mark a scenario as the active one for its year ── */
  const setActiveScenario = useMutation({
    mutationFn: async (scenarioId: string) => {
      // Find the scenario to get its year.
      const { data: target, error: selErr } = await db
        .from('budget_scenarios')
        .select('id, year')
        .eq('id', scenarioId)
        .single();
      if (selErr) throw selErr;

      // Clear the old active flag for that year, then set the new one.
      // The partial unique index enforces at most one active per year; we
      // do the clear first to avoid a conflict during the switch.
      const { error: clearErr } = await db
        .from('budget_scenarios')
        .update({ is_active: false })
        .eq('year', target.year)
        .eq('is_active', true);
      if (clearErr) throw clearErr;

      const { error: setErr } = await db
        .from('budget_scenarios')
        .update({ is_active: true })
        .eq('id', scenarioId);
      if (setErr) throw setErr;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Escenario activado');
    },
    onError: (error: Error) => {
      toast.error(`Error al activar escenario: ${error.message}`);
    },
  });

  /* ── Mutation: delete a scenario ── */
  const deleteScenario = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from('budget_scenarios')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Escenario eliminado');
    },
    onError: (error: Error) => {
      toast.error(`Error al eliminar escenario: ${error.message}`);
    },
  });

  return {
    scenarios,
    activeScenario,
    isLoading: scenariosQuery.isLoading,
    error: scenariosQuery.error,
    createScenario,
    updateScenario,
    setActiveScenario,
    deleteScenario,
  };
}
