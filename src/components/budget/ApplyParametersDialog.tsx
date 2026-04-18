/**
 * @file ApplyParametersDialog.tsx
 * @description Non-destructive "apply parameters" flow. Given the current
 *   scenario's parameters, it computes what the cells would look like if
 *   the inflation, membership-growth and extraordinary-income multiplier
 *   were applied, previews the delta (old total → new total per section),
 *   and — on confirm — writes the result into a NEW derived scenario so
 *   the original numbers are preserved.
 *
 *   Math:
 *     • inflation_percent is applied in monthly progression: the Jan cell
 *       stays, Feb is multiplied by (1 + m)^1, Mar by (1 + m)^2, etc.,
 *       where m = annual_percent / 100 / 12 (approximate monthly rate).
 *     • membership_growth_percent scales monthly_fee income cells by
 *       (1 + growth/100) on top of the inflation factor, again in
 *       progression across months.
 *     • extraordinary_income_multiplier applies a flat multiplier to
 *       every cell in the extraordinary_income category.
 *
 *   The new scenario is named "<original> (ajustado YYYY-MM-DD)".
 */

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

import { useBudgetLines } from '@/hooks/useBudgetLines';
import type { BudgetLine, BudgetScenario } from '@/lib/budget-types';
import type { TransactionType } from '@/lib/types';
import { formatCurrencyCompact, getCurrencyForAccount } from '@/lib/utils';

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as any;

interface ApplyParametersDialogProps {
  scenarioId: string;
  inflationPercent: number;
  membershipGrowthPercent: number;
  extraordinaryIncomeMultiplier: number;
}

/** Computes the projected amount for a cell given the parameters. */
function projectAmount(
  line: Pick<
    BudgetLine,
    'budgeted_amount' | 'month' | 'category' | 'transaction_type'
  >,
  inflationPercent: number,
  membershipGrowthPercent: number,
  extraordinaryIncomeMultiplier: number,
): number {
  const base = Number(line.budgeted_amount) || 0;
  if (base === 0) return 0;

  // Monthly compounding over (month - 1) periods — Jan is unchanged.
  const monthsFromStart = Math.max(0, line.month - 1);
  const monthlyInflation = inflationPercent / 100 / 12;
  const inflationFactor = Math.pow(1 + monthlyInflation, monthsFromStart);

  let value = base * inflationFactor;

  // Membership growth affects monthly fee income specifically.
  if (line.category === 'monthly_fee' && line.transaction_type === 'income') {
    const monthlyGrowth = membershipGrowthPercent / 100 / 12;
    value *= Math.pow(1 + monthlyGrowth, monthsFromStart);
  }

  // Extraordinary income multiplier is flat across months.
  if (line.category === 'extraordinary_income') {
    value *= extraordinaryIncomeMultiplier;
  }

  return Math.round(value * 100) / 100;
}

export function ApplyParametersDialog({
  scenarioId,
  inflationPercent,
  membershipGrowthPercent,
  extraordinaryIncomeMultiplier,
}: ApplyParametersDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();

  // Fetch just this one scenario (avoids pulling the whole list).
  const scenarioQuery = useQuery({
    queryKey: ['budget_scenario', scenarioId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await db
        .from('budget_scenarios')
        .select('*')
        .eq('id', scenarioId)
        .single();
      if (error) throw error;
      return data as BudgetScenario;
    },
  });
  const currentScenario: BudgetScenario | null = scenarioQuery.data ?? null;

  const { lines, isLoading: linesLoading } = useBudgetLines(
    open ? scenarioId : null,
  );

  /* Compute the projected lines + totals grouped by (account, type). */
  const preview = useMemo(() => {
    const byAccountType: Record<
      string,
      { account: string; type: TransactionType; oldTotal: number; newTotal: number }
    > = {};

    for (const line of lines) {
      const projected = projectAmount(
        line,
        inflationPercent,
        membershipGrowthPercent,
        extraordinaryIncomeMultiplier,
      );
      const key = `${line.account}::${line.transaction_type}`;
      if (!byAccountType[key]) {
        byAccountType[key] = {
          account: line.account,
          type: line.transaction_type,
          oldTotal: 0,
          newTotal: 0,
        };
      }
      byAccountType[key].oldTotal += Number(line.budgeted_amount) || 0;
      byAccountType[key].newTotal += projected;
    }

    return Object.values(byAccountType).sort((a, b) =>
      a.account === b.account
        ? a.type.localeCompare(b.type)
        : a.account.localeCompare(b.account),
    );
  }, [
    lines,
    inflationPercent,
    membershipGrowthPercent,
    extraordinaryIncomeMultiplier,
  ]);

  const handleApply = async () => {
    if (!currentScenario) {
      toast.error('No se encontró el escenario actual');
      return;
    }
    if (lines.length === 0) {
      toast.error('El escenario no tiene celdas para proyectar');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create the derived scenario.
      const today = new Date().toISOString().slice(0, 10);
      const newName = `${currentScenario.scenario_name} (ajustado ${today})`;

      const { data: user } = await supabase.auth.getUser();
      const created_by = user.user?.id ?? null;

      const { data: inserted, error: insErr } = await db
        .from('budget_scenarios')
        .insert({
          year: currentScenario.year,
          scenario_name: newName,
          parent_scenario_id: currentScenario.id,
          notes: `Generado al aplicar parámetros: inflación ${inflationPercent}%, crecimiento ${membershipGrowthPercent}%, multiplicador ${extraordinaryIncomeMultiplier}.`,
          created_by,
        })
        .select()
        .single();

      if (insErr) throw insErr;
      const newScenario = inserted as BudgetScenario;

      // Copy the projected lines.
      const toInsert = lines.map((l) => ({
        budget_scenario_id: newScenario.id,
        month: l.month,
        account: l.account,
        transaction_type: l.transaction_type,
        category: l.category,
        budgeted_amount: projectAmount(
          l,
          inflationPercent,
          membershipGrowthPercent,
          extraordinaryIncomeMultiplier,
        ),
      }));

      const { error: bulkErr } = await db
        .from('budget_lines')
        .insert(toInsert);
      if (bulkErr) throw bulkErr;

      // Copy parameters onto the new scenario (trigger already inserted a
      // blank row; we update it with the applied values).
      const { error: paramErr } = await db
        .from('budget_scenario_parameters')
        .update({
          inflation_percent: inflationPercent,
          membership_growth_percent: membershipGrowthPercent,
          extraordinary_income_multiplier: extraordinaryIncomeMultiplier,
        })
        .eq('budget_scenario_id', newScenario.id);
      if (paramErr) throw paramErr;

      queryClient.invalidateQueries({ queryKey: ['budget_scenarios'] });
      queryClient.invalidateQueries({ queryKey: ['budget_lines'] });
      queryClient.invalidateQueries({ queryKey: ['budget_parameters'] });

      toast.success(`Escenario "${newName}" creado`);
      setOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      toast.error(`Error al aplicar parámetros: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const grandOldTotal = preview.reduce((s, r) => s + r.oldTotal, 0);
  const grandNewTotal = preview.reduce((s, r) => s + r.newTotal, 0);
  const grandDelta = grandNewTotal - grandOldTotal;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Wand2 className="mr-2 h-4 w-4" />
          Aplicar parámetros
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Aplicar parámetros al presupuesto</DialogTitle>
          <DialogDescription>
            Se creará un <strong>nuevo escenario derivado</strong> con los
            valores proyectados. El escenario original no se modifica.
          </DialogDescription>
        </DialogHeader>

        {linesLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Calculando proyección...
          </div>
        ) : lines.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No hay celdas en este escenario para proyectar. Agrega valores
            primero.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/30 p-3 text-xs">
              <p>
                <strong>Inflación:</strong> {inflationPercent}% anual (progresión
                mensual)
              </p>
              <p>
                <strong>Crecimiento membresía:</strong>{' '}
                {membershipGrowthPercent}% (aplicado a cuotas mensuales)
              </p>
              <p>
                <strong>Multiplicador ingresos extraord.:</strong>{' '}
                {extraordinaryIncomeMultiplier}×
              </p>
            </div>

            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left">Cuenta / tipo</th>
                    <th className="px-3 py-2 text-right">Original</th>
                    <th className="px-3 py-2 text-right">Proyectado</th>
                    <th className="px-3 py-2 text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => {
                    const delta = row.newTotal - row.oldTotal;
                    const currency = getCurrencyForAccount(row.account);
                    return (
                      <tr
                        key={`${row.account}-${row.type}`}
                        className="border-b last:border-0"
                      >
                        <td className="px-3 py-1.5 font-mono text-xs">
                          {row.account} · {row.type}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">
                          {formatCurrencyCompact(row.oldTotal, currency)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs">
                          {formatCurrencyCompact(row.newTotal, currency)}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-mono text-xs ${
                            delta >= 0 ? 'amount-positive' : 'amount-negative'
                          }`}
                        >
                          {delta >= 0 ? '+' : ''}
                          {formatCurrencyCompact(delta, currency)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-muted/40">
                    <td className="px-3 py-1.5 font-semibold">Total</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold">
                      {formatCurrencyCompact(grandOldTotal)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs font-semibold">
                      {formatCurrencyCompact(grandNewTotal)}
                    </td>
                    <td
                      className={`px-3 py-1.5 text-right font-mono text-xs font-bold ${
                        grandDelta >= 0 ? 'amount-positive' : 'amount-negative'
                      }`}
                    >
                      {grandDelta >= 0 ? '+' : ''}
                      {formatCurrencyCompact(grandDelta)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              Nota: los totales mezclan múltiples monedas para dar un
              panorama general. El escenario resultante preserva cada moneda
              por cuenta.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleApply}
            disabled={
              isSubmitting || linesLoading || lines.length === 0
            }
          >
            {isSubmitting ? 'Aplicando...' : 'Crear escenario derivado'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
