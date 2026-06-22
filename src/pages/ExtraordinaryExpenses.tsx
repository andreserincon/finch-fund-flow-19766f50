import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useExtraordinaryExpenses, ExtraordinaryExpense } from '@/hooks/useExtraordinaryExpenses';
import { useEventMemberPayments } from '@/hooks/useEventMemberPayments';
import { useMembers } from '@/hooks/useMembers';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { formatCurrency, parseLocalDate } from '@/lib/utils';
import { PlusCircle, Pencil, Trash2, Tag, ExternalLink } from 'lucide-react';

const expenseSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(40, 'Máximo 40 caracteres'),
  description: z.string().max(500).optional(),
  default_amount: z.number().min(0, 'El monto debe ser positivo'),
  installments: z.number({ invalid_type_error: 'Ingresá un número' }).int('Debe ser un entero').min(1, 'Mínimo 1 cuota').max(36, 'Máximo 36 cuotas'),
  payment_deadline: z.string().optional(),
  charge_from_date: z.string().optional(),
  assign_to_members: z.boolean().optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

function formatDeadline(value: string | null): string {
  if (!value) return 'Sin vencimiento';
  return parseLocalDate(value).toLocaleDateString('es-AR');
}

function AddExpenseDialog() {
  const [open, setOpen] = useState(false);
  const { addExpense } = useExtraordinaryExpenses();
  const { createPaymentsForAllMembers } = useEventMemberPayments();
  const { members } = useMembers();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { default_amount: 0, installments: 1, assign_to_members: true },
  });

  const assignToMembers = watch('assign_to_members');
  const defaultAmount = watch('default_amount');
  const installments = watch('installments') || 1;
  const activeMembersCount = members.filter(m => m.is_active).length;

  const onSubmit = async (data: ExpenseFormData) => {
    const result = await addExpense.mutateAsync({
      name: data.name,
      description: data.description,
      default_amount: data.default_amount,
      installments: data.installments,
      payment_deadline: data.payment_deadline || null,
      charge_from_date: data.charge_from_date || null,
    });
    if (data.assign_to_members && result?.id && data.default_amount > 0) {
      await createPaymentsForAllMembers.mutateAsync({
        eventId: result.id,
        amountPerMember: data.default_amount,
      });
    }
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="press"><PlusCircle className="mr-2 h-4 w-4" />Nuevo evento</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo evento</DialogTitle>
          <DialogDescription>Creá un evento y asigná la cuota a los miembros.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del evento</Label>
            <Input id="name" {...register('name')} placeholder="ej., Cena de Fin de Año" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Textarea id="description" {...register('description')} placeholder="Breve descripción..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_amount">Cuota por miembro (ARS)</Label>
            <Input id="default_amount" type="number" inputMode="decimal" step="0.01" {...register('default_amount', { valueAsNumber: true })} />
            {errors.default_amount && <p className="text-sm text-destructive">{errors.default_amount.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="installments">Número de cuotas</Label>
            <Input id="installments" type="number" min="1" max="36" step="1" {...register('installments', { valueAsNumber: true })} />
            <p className="text-xs text-muted-foreground">
              Una cuota por mes desde la fecha de cobro.{' '}
              {installments > 1
                ? `${installments} cuotas de ${formatCurrency((defaultAmount || 0) / installments)}.`
                : 'Pago en una sola cuota.'}
            </p>
            {errors.installments && <p className="text-sm text-destructive">{errors.installments.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="charge_from_date">Cobrar a partir de (opcional)</Label>
            <Input id="charge_from_date" type="date" {...register('charge_from_date')} />
            <p className="text-xs text-muted-foreground">
              Marca el mes de la primera cuota. Además, excluye al evento de reportes anteriores a esa fecha.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment_deadline">Fecha límite de pago (opcional)</Label>
            <Input id="payment_deadline" type="date" {...register('payment_deadline')} />
            <p className="text-xs text-muted-foreground">
              A 15 días o menos del vencimiento, los miembros con deuda figuran como "impagos". Pasado el vencimiento, "demorados".
            </p>
          </div>
          <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
            <Checkbox id="assign_to_members" checked={assignToMembers} onCheckedChange={(checked) => setValue('assign_to_members', !!checked)} />
            <div className="flex-1">
              <Label htmlFor="assign_to_members" className="cursor-pointer">Asignar cuota a todos los miembros activos</Label>
              <p className="text-xs text-muted-foreground">
                {activeMembersCount} miembros activos x {formatCurrency(defaultAmount || 0)} = {formatCurrency(activeMembersCount * (defaultAmount || 0))}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creando...' : 'Crear evento'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditExpenseDialog({ expense }: { expense: ExtraordinaryExpense }) {
  const [open, setOpen] = useState(false);
  const { updateExpense } = useExtraordinaryExpenses();

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      name: expense.name,
      description: expense.description || '',
      default_amount: expense.default_amount,
      installments: expense.installments ?? 1,
      payment_deadline: expense.payment_deadline || '',
      charge_from_date: expense.charge_from_date || '',
    },
  });

  const defaultAmount = watch('default_amount') || 0;
  const installments = watch('installments') || 1;

  const onSubmit = async (data: ExpenseFormData) => {
    await updateExpense.mutateAsync({
      id: expense.id,
      name: data.name,
      description: data.description,
      default_amount: data.default_amount,
      installments: data.installments,
      payment_deadline: data.payment_deadline || null,
      charge_from_date: data.charge_from_date || null,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="press" aria-label="Editar evento"><Pencil className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar evento</DialogTitle>
          <DialogDescription>Actualizá los detalles del evento.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nombre</Label>
            <Input id="edit-name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">Descripción (opcional)</Label>
            <Textarea id="edit-description" {...register('description')} rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-default_amount">Cuota por miembro (ARS)</Label>
            <Input id="edit-default_amount" type="number" inputMode="decimal" step="0.01" {...register('default_amount', { valueAsNumber: true })} />
            {errors.default_amount && <p className="text-sm text-destructive">{errors.default_amount.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-installments">Número de cuotas</Label>
            <Input id="edit-installments" type="number" min="1" max="36" step="1" {...register('installments', { valueAsNumber: true })} />
            <p className="text-xs text-muted-foreground">
              Una cuota por mes desde la fecha de cobro.{' '}
              {installments > 1
                ? `${installments} cuotas de ${formatCurrency(defaultAmount / installments)}.`
                : 'Pago en una sola cuota.'}
            </p>
            {errors.installments && <p className="text-sm text-destructive">{errors.installments.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-charge_from_date">Cobrar a partir de (opcional)</Label>
            <Input id="edit-charge_from_date" type="date" {...register('charge_from_date')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-payment_deadline">Fecha límite de pago (opcional)</Label>
            <Input id="edit-payment_deadline" type="date" {...register('payment_deadline')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar cambios'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OpenOverviewButton({ expense }: { expense: ExtraordinaryExpense }) {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="press"
      onClick={() => navigate(`/events/${expense.id}`)}
      aria-label="Abrir resumen del evento"
    >
      <ExternalLink className="h-4 w-4" />
    </Button>
  );
}

function DeleteExpenseDialog({ expense }: { expense: ExtraordinaryExpense }) {
  const { deleteExpense } = useExtraordinaryExpenses();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="press text-destructive hover:text-destructive" aria-label="Eliminar evento"><Trash2 className="h-4 w-4" /></Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar "{expense.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            Esto eliminará el evento y todos los registros de pagos de miembros asociados. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => deleteExpense.mutate(expense.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function ExtraordinaryExpenses() {
  const { expenses, isLoading, updateExpense } = useExtraordinaryExpenses();
  const { isAdmin } = useIsAdmin();
  const navigate = useNavigate();

  const handleToggleActive = (expense: ExtraordinaryExpense) => {
    updateExpense.mutate({ id: expense.id, is_active: !expense.is_active });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Eventos</h1>
          <p className="text-muted-foreground">Gestioná las cuotas y pagos de cada evento</p>
        </div>
        {isAdmin && <AddExpenseDialog />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            Lista de eventos
          </CardTitle>
          <CardDescription>Tocá un evento para ver el resumen completo</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Todavía no hay eventos. Creá el primero.
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="md:hidden space-y-3">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="press cursor-pointer rounded-lg border bg-card p-4 space-y-3"
                    onClick={() => navigate(`/events/${expense.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{expense.name}</p>
                          {!expense.is_active && <Badge variant="outline">Inactivo</Badge>}
                        </div>
                        {expense.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{expense.description}</p>
                        )}
                      </div>
                      <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm border-t border-border/50 pt-3">
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground text-xs">Cuota por miembro</p>
                        <p className="font-mono tabular-nums font-semibold">{formatCurrency(expense.default_amount)}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground text-xs">Vencimiento</p>
                        <p className="text-sm">{formatDeadline(expense.payment_deadline)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/50 pt-3" onClick={(e) => e.stopPropagation()}>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Switch checked={expense.is_active} onCheckedChange={() => handleToggleActive(expense)} disabled={!isAdmin} />
                        Activo
                      </label>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <EditExpenseDialog expense={expense} />
                          <DeleteExpenseDialog expense={expense} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table view */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre del evento</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-right">Cuota/Miembro</TableHead>
                      <TableHead>Vencimiento</TableHead>
                      <TableHead className="text-center w-16">Activo</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow
                        key={expense.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => navigate(`/events/${expense.id}`)}
                      >
                        <TableCell className="font-medium">{expense.name}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate">{expense.description || ''}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(expense.default_amount)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDeadline(expense.payment_deadline)}</TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Switch checked={expense.is_active} onCheckedChange={() => handleToggleActive(expense)} disabled={!isAdmin} />
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            <OpenOverviewButton expense={expense} />
                            {isAdmin && (
                              <>
                                <EditExpenseDialog expense={expense} />
                                <DeleteExpenseDialog expense={expense} />
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
