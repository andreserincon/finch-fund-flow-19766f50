import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
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
import { PlusCircle, Pencil, Trash2, Tag, ExternalLink } from 'lucide-react';

const expenseSchema = z.object({
  name: z.string().min(1, 'El nombre es obligatorio').max(100),
  description: z.string().max(500).optional(),
  default_amount: z.number().min(0, 'El monto debe ser positivo'),
  payment_deadline: z.string().optional(),
  assign_to_members: z.boolean().optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

function AddExpenseDialog() {
  const [open, setOpen] = useState(false);
  const { addExpense } = useExtraordinaryExpenses();
  const { createPaymentsForAllMembers } = useEventMemberPayments();
  const { members } = useMembers();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { default_amount: 0, assign_to_members: true },
  });

  const assignToMembers = watch('assign_to_members');
  const defaultAmount = watch('default_amount');
  const activeMembersCount = members.filter(m => m.is_active).length;

  const onSubmit = async (data: ExpenseFormData) => {
    const result = await addExpense.mutateAsync({
      name: data.name,
      description: data.description,
      default_amount: data.default_amount,
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
        <Button><PlusCircle className="mr-2 h-4 w-4" />Agregar Evento</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar Evento / Categoría de Gasto</DialogTitle>
          <DialogDescription>Crear un nuevo evento con cuotas para todos los miembros.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del Evento</Label>
            <Input id="name" {...register('name')} placeholder="ej., Fiesta de Fin de Año" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descripción (Opcional)</Label>
            <Textarea id="description" {...register('description')} placeholder="Breve descripción..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_amount">Cuota por Miembro (ARS)</Label>
            <Input id="default_amount" type="number" step="0.01" {...register('default_amount', { valueAsNumber: true })} />
            {errors.default_amount && <p className="text-sm text-destructive">{errors.default_amount.message}</p>}
          </div>
          <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
            <Checkbox id="assign_to_members" checked={assignToMembers} onCheckedChange={(checked) => setValue('assign_to_members', !!checked)} />
            <div className="flex-1">
              <Label htmlFor="assign_to_members" className="cursor-pointer">Asignar cuota a todos los miembros activos</Label>
              <p className="text-xs text-muted-foreground">
                {activeMembersCount} miembros activos × ARS {defaultAmount?.toFixed(2) || '0.00'} = ARS {(activeMembersCount * (defaultAmount || 0)).toFixed(2)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creando...' : 'Crear Evento'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditExpenseDialog({ expense }: { expense: ExtraordinaryExpense }) {
  const [open, setOpen] = useState(false);
  const { updateExpense } = useExtraordinaryExpenses();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { name: expense.name, description: expense.description || '', default_amount: expense.default_amount },
  });

  const onSubmit = async (data: ExpenseFormData) => {
    await updateExpense.mutateAsync({ id: expense.id, name: data.name, description: data.description, default_amount: data.default_amount });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Evento</DialogTitle>
          <DialogDescription>Actualizar los detalles del evento.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Nombre</Label>
            <Input id="edit-name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">Descripción (Opcional)</Label>
            <Textarea id="edit-description" {...register('description')} rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-default_amount">Cuota por Miembro (ARS)</Label>
            <Input id="edit-default_amount" type="number" step="0.01" {...register('default_amount', { valueAsNumber: true })} />
            {errors.default_amount && <p className="text-sm text-destructive">{errors.default_amount.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar Cambios'}</Button>
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
      onClick={() => navigate(`/events/${expense.id}`)}
      title="Abrir resumen del evento"
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
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Eventos y Gastos</h1>
          <p className="text-muted-foreground">Gestionar eventos con cuotas por miembro</p>
        </div>
        {isAdmin && <AddExpenseDialog />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            Eventos
          </CardTitle>
          <CardDescription>Hacé clic en un evento para ver el resumen completo</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aún no hay eventos. ¡Creá el primero!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre del Evento</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Cuota/Miembro</TableHead>
                  <TableHead className="text-center">Activo</TableHead>
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
                    <TableCell className="text-muted-foreground max-w-xs truncate">{expense.description || '—'}</TableCell>
                    <TableCell className="text-right">ARS {expense.default_amount.toFixed(2)}</TableCell>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
