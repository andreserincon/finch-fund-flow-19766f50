/**
 * @file BudgetParametersPanel.tsx
 * @description Displays the parametric knobs attached to a budget scenario
 *   (inflation %, membership growth %, extraordinary income multiplier).
 *
 *   - Admins can edit the values and save them to
 *     `budget_scenario_parameters` via useBudgetParameters.
 *   - Non-admins see the same values rendered read-only.
 *
 *   Applying the parameters to the budget lines is handled by a sibling
 *   component (ApplyParametersDialog); this panel only manages the
 *   parameter values themselves.
 */

import { useEffect, useState } from 'react';
import { Percent, Save, Sparkles, Users, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBudgetParameters } from '@/hooks/useBudgetParameters';
import { ApplyParametersDialog } from '@/components/budget/ApplyParametersDialog';

interface BudgetParametersPanelProps {
  scenarioId: string;
  readOnly?: boolean;
}

interface Draft {
  inflation_percent: string;
  membership_growth_percent: string;
  extraordinary_income_multiplier: string;
}

const asString = (n: number | null | undefined): string =>
  n === null || n === undefined ? '0' : String(n);

export function BudgetParametersPanel({
  scenarioId,
  readOnly = false,
}: BudgetParametersPanelProps) {
  const { parameters, isLoading, updateParameters } =
    useBudgetParameters(scenarioId);

  const [draft, setDraft] = useState<Draft>({
    inflation_percent: '0',
    membership_growth_percent: '0',
    extraordinary_income_multiplier: '1',
  });

  // Hydrate draft whenever the row changes (scenario switch or refetch).
  useEffect(() => {
    if (parameters) {
      setDraft({
        inflation_percent: asString(parameters.inflation_percent),
        membership_growth_percent: asString(parameters.membership_growth_percent),
        extraordinary_income_multiplier: asString(
          parameters.extraordinary_income_multiplier,
        ),
      });
    }
  }, [parameters]);

  const dirty =
    !!parameters &&
    (Number(draft.inflation_percent) !== parameters.inflation_percent ||
      Number(draft.membership_growth_percent) !==
        parameters.membership_growth_percent ||
      Number(draft.extraordinary_income_multiplier) !==
        parameters.extraordinary_income_multiplier);

  const handleSave = () => {
    updateParameters.mutate({
      inflation_percent: Number(draft.inflation_percent) || 0,
      membership_growth_percent: Number(draft.membership_growth_percent) || 0,
      extraordinary_income_multiplier:
        Number(draft.extraordinary_income_multiplier) || 1,
    });
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Cargando parámetros...
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-base font-semibold">Parámetros del escenario</h3>
        </div>
        {!readOnly && parameters && (
          <ApplyParametersDialog
            scenarioId={scenarioId}
            inflationPercent={Number(draft.inflation_percent) || 0}
            membershipGrowthPercent={
              Number(draft.membership_growth_percent) || 0
            }
            extraordinaryIncomeMultiplier={
              Number(draft.extraordinary_income_multiplier) || 1
            }
          />
        )}
      </div>

      <div className="grid gap-4 p-4 sm:grid-cols-3">
        <ParameterField
          icon={<Percent className="h-3 w-3" />}
          label="Inflación anual (%)"
          hint="Se aplica en progresión mensual a todas las celdas."
          value={draft.inflation_percent}
          onChange={(v) => setDraft((d) => ({ ...d, inflation_percent: v }))}
          readOnly={readOnly}
          step="0.01"
        />
        <ParameterField
          icon={<Users className="h-3 w-3" />}
          label="Crecimiento membresía (%)"
          hint="Aplicado a la categoría cuotas mensuales."
          value={draft.membership_growth_percent}
          onChange={(v) =>
            setDraft((d) => ({ ...d, membership_growth_percent: v }))
          }
          readOnly={readOnly}
          step="0.01"
        />
        <ParameterField
          icon={<TrendingUp className="h-3 w-3" />}
          label="Multiplicador ingresos extraord."
          hint="1.00 = sin cambios; 1.25 = +25%."
          value={draft.extraordinary_income_multiplier}
          onChange={(v) =>
            setDraft((d) => ({ ...d, extraordinary_income_multiplier: v }))
          }
          readOnly={readOnly}
          step="0.0001"
        />
      </div>

      {!readOnly && (
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={!dirty || updateParameters.isPending}
            onClick={() => {
              if (parameters) {
                setDraft({
                  inflation_percent: asString(parameters.inflation_percent),
                  membership_growth_percent: asString(
                    parameters.membership_growth_percent,
                  ),
                  extraordinary_income_multiplier: asString(
                    parameters.extraordinary_income_multiplier,
                  ),
                });
              }
            }}
          >
            Descartar
          </Button>
          <Button
            size="sm"
            disabled={!dirty || updateParameters.isPending}
            onClick={handleSave}
          >
            <Save className="mr-2 h-4 w-4" />
            {updateParameters.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Single parameter input field                                    */
/* ---------------------------------------------------------------- */

interface ParameterFieldProps {
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  readOnly: boolean;
  step: string;
}

function ParameterField({
  icon,
  label,
  hint,
  value,
  onChange,
  readOnly,
  step,
}: ParameterFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </Label>
      {readOnly ? (
        <div className="rounded border border-input bg-muted/40 px-3 py-2 font-mono text-sm">
          {value}
        </div>
      ) : (
        <Input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
        />
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
