/**
 * @file Budget.tsx
 * @description Top-level page for the Budget module (Phase 1).
 *   Renders a scenario picker plus the editable 12-month matrix for the
 *   selected scenario. Admins can create new scenarios and activate
 *   one as "the" plan for its year; non-admin treasury viewers see the
 *   same data read-only.
 *
 *   Phase 2 adds the parametric knobs panel (inflation %, membership
 *   growth %, extraordinary-income multiplier) plus an "apply parameters"
 *   action that spawns a derived scenario with the projected numbers.
 *
 *   BCRA REM integration, variance view, and revisions are introduced
 *   in later phases.
 */

import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, CheckCircle2, PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useBudgets } from '@/hooks/useBudgets';
import { useIsAdmin } from '@/hooks/useIsAdmin';

import { CreateScenarioDialog } from '@/components/budget/CreateScenarioDialog';
import { BudgetMatrixEditor } from '@/components/budget/BudgetMatrixEditor';
import { BudgetParametersPanel } from '@/components/budget/BudgetParametersPanel';

export default function Budget() {
  const { isAdmin } = useIsAdmin();

  /** Default the year filter to the current calendar year. */
  const [year, setYear] = useState<number>(() => new Date().getFullYear());

  const { scenarios, activeScenario, isLoading, setActiveScenario } =
    useBudgets(year);

  /** Currently selected scenario for editing (defaults to active). */
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );

  // Keep the selected scenario in sync with the active one when the list
  // of scenarios changes (e.g. after creating or switching year).
  useEffect(() => {
    if (selectedScenarioId) {
      // If the currently selected scenario is no longer in the list,
      // reset to the active (or first) one.
      const stillThere = scenarios.some((s) => s.id === selectedScenarioId);
      if (!stillThere) {
        setSelectedScenarioId(activeScenario?.id ?? null);
      }
    } else {
      setSelectedScenarioId(activeScenario?.id ?? null);
    }
  }, [scenarios, activeScenario, selectedScenarioId]);

  const selectedScenario = useMemo(
    () => scenarios.find((s) => s.id === selectedScenarioId) ?? null,
    [scenarios, selectedScenarioId],
  );

  /** Year options: the current year ± 2 (a reasonable default range). */
  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    return [now - 2, now - 1, now, now + 1, now + 2];
  }, []);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">
            Presupuesto anual
          </h1>
          <p className="text-sm text-muted-foreground">
            Planificación por mes, cuenta y categoría. Crea escenarios para
            modelar diferentes supuestos.
          </p>
        </div>
        {isAdmin && (
          <CreateScenarioDialog
            defaultYear={year}
            existingScenarios={scenarios}
            onCreated={(s) => setSelectedScenarioId(s.id)}
          />
        )}
      </div>

      {/* ── Year + scenario selectors ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="space-y-1 sm:w-[160px]">
          <label className="text-xs text-muted-foreground flex items-center gap-1">
            <CalendarRange className="h-3 w-3" />
            Año
          </label>
          <Select
            value={String(year)}
            onValueChange={(v) => {
              setYear(Number(v));
              setSelectedScenarioId(null); // reset; effect will re-pick
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 flex-1">
          <label className="text-xs text-muted-foreground">Escenario</label>
          <Select
            value={selectedScenarioId ?? ''}
            onValueChange={(v) => setSelectedScenarioId(v)}
            disabled={scenarios.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  isLoading
                    ? 'Cargando...'
                    : scenarios.length === 0
                      ? 'No hay escenarios para este año'
                      : 'Selecciona un escenario'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {scenarios.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span className="flex items-center gap-2">
                    {s.scenario_name}
                    {s.is_active && (
                      <Badge
                        variant="default"
                        className="bg-success/10 text-success hover:bg-success/20"
                      >
                        Activo
                      </Badge>
                    )}
                    {s.revision_number > 0 && (
                      <Badge variant="outline" className="text-xs">
                        Rev {s.revision_number}
                      </Badge>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isAdmin && selectedScenario && !selectedScenario.is_active && (
          <Button
            variant="outline"
            onClick={() => setActiveScenario.mutate(selectedScenario.id)}
            disabled={setActiveScenario.isPending}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Marcar como activo
          </Button>
        )}
      </div>

      {/* ── Content ── */}
      {scenarios.length === 0 && !isLoading ? (
        <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
          <h3 className="text-base font-semibold">
            Aún no hay escenarios para {year}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? 'Crea el primer escenario para empezar a planificar.'
              : 'Pídele al tesorero que cree un escenario para este año.'}
          </p>
          {isAdmin && (
            <div className="mt-4 flex justify-center">
              <CreateScenarioDialog
                defaultYear={year}
                existingScenarios={scenarios}
                onCreated={(s) => setSelectedScenarioId(s.id)}
                trigger={
                  <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Crear escenario
                  </Button>
                }
              />
            </div>
          )}
        </div>
      ) : selectedScenarioId ? (
        <div className="space-y-4 md:space-y-6">
          <BudgetParametersPanel
            scenarioId={selectedScenarioId}
            readOnly={!isAdmin}
          />
          <BudgetMatrixEditor
            scenarioId={selectedScenarioId}
            readOnly={!isAdmin}
          />
        </div>
      ) : null}
    </div>
  );
}
