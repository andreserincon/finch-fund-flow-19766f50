import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useExtraordinaryExpenses, ExtraordinaryExpense } from '@/hooks/useExtraordinaryExpenses';
import { PlusCircle, Pencil, Trash2, Tag } from 'lucide-react';

const expenseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  default_amount: z.number().min(0, 'Amount must be positive'),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

function AddExpenseDialog() {
  const [open, setOpen] = useState(false);
  const { addExpense } = useExtraordinaryExpenses();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { default_amount: 0 },
  });

  const onSubmit = async (data: ExpenseFormData) => {
    await addExpense.mutateAsync({
      name: data.name,
      description: data.description,
      default_amount: data.default_amount,
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Expense Category</DialogTitle>
          <DialogDescription>Create a new extraordinary expense category.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...register('name')} placeholder="e.g., Year End Party Fee" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea id="description" {...register('description')} placeholder="Brief description..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_amount">Default Amount (€)</Label>
            <Input id="default_amount" type="number" step="0.01" {...register('default_amount', { valueAsNumber: true })} />
            {errors.default_amount && <p className="text-sm text-destructive">{errors.default_amount.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Adding...' : 'Add Category'}</Button>
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
    defaultValues: {
      name: expense.name,
      description: expense.description || '',
      default_amount: expense.default_amount,
    },
  });

  const onSubmit = async (data: ExpenseFormData) => {
    await updateExpense.mutateAsync({ id: expense.id, ...data });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Expense Category</DialogTitle>
          <DialogDescription>Update the expense category details.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description (Optional)</Label>
            <Textarea id="edit-description" {...register('description')} rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-default_amount">Default Amount (€)</Label>
            <Input id="edit-default_amount" type="number" step="0.01" {...register('default_amount', { valueAsNumber: true })} />
            {errors.default_amount && <p className="text-sm text-destructive">{errors.default_amount.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteExpenseDialog({ expense }: { expense: ExtraordinaryExpense }) {
  const { deleteExpense } = useExtraordinaryExpenses();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{expense.name}"?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete this expense category.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteExpense.mutate(expense.id)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function ExtraordinaryExpenses() {
  const { expenses, isLoading, updateExpense } = useExtraordinaryExpenses();

  const handleToggleActive = (expense: ExtraordinaryExpense) => {
    updateExpense.mutate({ id: expense.id, is_active: !expense.is_active });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Expense Categories</h1>
          <p className="text-muted-foreground">Manage extraordinary expense types</p>
        </div>
        <AddExpenseDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            Categories
          </CardTitle>
          <CardDescription>
            Define expense categories for events and special fees
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No expense categories yet. Add your first one!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Default Amount</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium">{expense.name}</TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">
                      {expense.description || '—'}
                    </TableCell>
                    <TableCell className="text-right">€{expense.default_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={expense.is_active}
                        onCheckedChange={() => handleToggleActive(expense)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <EditExpenseDialog expense={expense} />
                        <DeleteExpenseDialog expense={expense} />
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
