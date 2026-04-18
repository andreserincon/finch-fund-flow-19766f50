/**
 * @file CreateScenarioDialog.tsx
 * @description Dialog form to create a new named budget scenario for a
 *   given year. Optionally clones an existing scenario's cells and
 *   parameters so users can build variants quickly.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PlusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useBudgets } from '@/hooks/useBudgets';
import type { BudgetScenario } from '@/lib/budget-types';

const schema = z.object({
  year: z
    .number({ invalid_type_error: 'Año obligatorio' })
    .int()
    .min(2000)
    .max(2100),
  scenario_name: z
    .string()
    .min(1, 'Nombre obligatorio')
    .max(100, 'Máximo 100 caracteres'),
  notes: z.string().max(500).optional(),
  copy_from_scenario_id: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface CreateScenarioDialogProps {
  defaultYear?: number;
  /** Scenarios available as a copy-from source. */
  existingScenarios?: BudgetScenario[];
  /** Optional trigger override; defaults to a primary button. */
  trigger?: React.ReactNode;
  onCreated?: (scenario: BudgetScenario) => void;
}

export function CreateScenarioDialog({
  defaultYear,
  existingScenarios = [],
  trigger,
  onCreated,
}: CreateScenarioDialogProps) {
  const [open, setOpen] = useState(false);
  const { createScenario } = useBudgets();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      year: defaultYear ?? new Date().getFullYear(),
      scenario_name: '',
      notes: '',
      copy_from_scenario_id: undefined,
    },
  });

  const copyFrom = watch('copy_from_scenario_id');

  const onSubmit = async (data: FormData) => {
    const result = await createScenario.mutateAsync({
      year: data.year,
      scenario_name: data.scenario_name,
      notes: data.notes || null,
      copy_from_scenario_id: data.copy_from_scenario_id || null,
    });
    reset();
    setOpen(false);
    onCreated?.(result);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Nuevo escenario
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nuevo escenario de presupuesto</DialogTitle>
          <DialogDescription>
            Crea una versión del presupuesto anual. Opcionalmente puedes
            copiar los valores de otro escenario existente.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="year">Año</Label>
              <Input
                id="year"
                type="number"
                min={2000}
                max={2100}
                {...register('year', { valueAsNumber: true })}
              />
              {errors.year && (
                <p className="text-xs text-destructive">{errors.year.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="scenario_name">Nombre</Label>
              <Input
                id="scenario_name"
                placeholder="Ej. Base 2026"
                {...register('scenario_name')}
              />
              {errors.scenario_name && (
                <p className="text-xs text-destructive">
                  {errors.scenario_name.message}
                </p>
              )}
            </div>
          </div>

          {existingScenarios.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="copy_from">Copiar desde (opcional)</Label>
              <Select
                value={copyFrom ?? 'none'}
                onValueChange={(v) =>
                  setValue(
                    'copy_from_scenario_id',
                    v === 'none' ? undefined : v,
                  )
                }
              >
                <SelectTrigger id="copy_from">
                  <SelectValue placeholder="— Ninguno —" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Ninguno —</SelectItem>
                  {existingScenarios.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.scenario_name} ({s.year})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si se selecciona, todas las celdas y parámetros se copiarán al
                nuevo escenario.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              placeholder="Ej. Escenario base asumiendo 130% de inflación anual"
              rows={3}
              {...register('notes')}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creando...' : 'Crear escenario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
