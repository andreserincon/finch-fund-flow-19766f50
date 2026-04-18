/**
 * @file useBudgetLines.ts
 * @description Query + upsert hook for the budget_lines table.
 *
 *   The editor UI treats lines as cells of a (month × account × type ×
 *   category) matrix. Missing cells simply don't have a row yet; the
 *   upsert mutation inserts-or-updates based on the unique constraint.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  BudgetLine,
  budgetLineKey,
} from '@/lib/budget-types';
import type {
  AccountType,
  TransactionType,
  TransactionCategory,
} from '@/lib/types';
import { toast } from 'sonner';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

export interface BudgetLineUpsertInput {
  budget_scenario_id: string;
  month: number;
  account: AccountType;
  transaction_type: TransactionType;
  category: TransactionCategory;
  budgeted_amount: number;
}

export function useBudgetLines(scenarioId: string | null | undefined) {
  const queryClient = useQueryClient();
  const enabled = !!scenarioId;

  const linesQuery = useQuery({
    queryKey: ['budget_lines', scenarioId],
    enabled,
    queryFn: async () => {
      if (!scenarioId) return [];
      const { data, error } = await db
        .from('budget_lines')
        .select('*')
        .eq('budget_scenario_id', scenarioId);
      if (error) throw error;
      return (data as BudgetLine[]) ?? [];
    },
  });

  const lines: BudgetLine[] = linesQuery.data ?? [];

  /**
   * Build a lookup map keyed by `${month}:${account}:${type}:${category}`
   * so the matrix editor can look up a cell in O(1).
   */
  const linesByKey: Map<string, BudgetLine> = new Map(
    lines.map((l) => [
      budgetLineKey(l.month, l.account, l.transaction_type, l.category),
      l,
    ]),
  );

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ['budget_lines', scenarioId],
    });
  };

  /* ── Mutation: upsert a single cell ── */
  const upsertLine = useMutation({
    mutationFn: async (input: BudgetLineUpsertInput) => {
      const { data, error } = await db
        .from('budget_lines')
        .upsert(input, {
          onConflict:
            'budget_scenario_id,month,account,transaction_type,category',
        })
        .select()
        .single();
      if (error) throw error;
      return data as BudgetLine;
    },
    onSuccess: () => {
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(`Error al guardar celda: ${error.message}`);
    },
  });

  /* ── Mutation: bulk upsert many cells (e.g. after applying inflation) ── */
  const upsertManyLines = useMutation({
    mutationFn: async (inputs: BudgetLineUpsertInput[]) => {
      if (inputs.length === 0) return [];
      const { data, error } = await db
        .from('budget_lines')
        .upsert(inputs, {
          onConflict:
            'budget_scenario_id,month,account,transaction_type,category',
        })
        .select();
      if (error) throw error;
      return (data as BudgetLine[]) ?? [];
    },
    onSuccess: () => {
      invalidate();
      toast.success('Celdas actualizadas');
    },
    onError: (error: Error) => {
      toast.error(`Error al guardar celdas: ${error.message}`);
    },
  });

  return {
    lines,
    linesByKey,
    isLoading: linesQuery.isLoading,
    error: linesQuery.error,
    upsertLine,
    upsertManyLines,
  };
}
