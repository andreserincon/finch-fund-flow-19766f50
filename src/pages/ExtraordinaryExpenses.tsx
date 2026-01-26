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
import { Checkbox } from '@/components/ui/checkbox';
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
import { useEventMemberPayments } from '@/hooks/useEventMemberPayments';
import { useMembers } from '@/hooks/useMembers';
import { PlusCircle, Pencil, Trash2, Tag, Users, Check, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const expenseSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  default_amount: z.number().min(0, 'Amount must be positive'),
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
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Event
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Event / Expense Category</DialogTitle>
          <DialogDescription>Create a new event with fees for all members.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Event Name</Label>
            <Input id="name" {...register('name')} placeholder="e.g., Year End Party" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea id="description" {...register('description')} placeholder="Brief description..." rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_amount">Fee Per Member (ARS)</Label>
            <Input id="default_amount" type="number" step="0.01" {...register('default_amount', { valueAsNumber: true })} />
            {errors.default_amount && <p className="text-sm text-destructive">{errors.default_amount.message}</p>}
          </div>

          <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
            <Checkbox
              id="assign_to_members"
              checked={assignToMembers}
              onCheckedChange={(checked) => setValue('assign_to_members', !!checked)}
            />
            <div className="flex-1">
              <Label htmlFor="assign_to_members" className="cursor-pointer">
                Assign fee to all active members
              </Label>
              <p className="text-xs text-muted-foreground">
                {activeMembersCount} active members × ARS {defaultAmount?.toFixed(2) || '0.00'} = ARS {(activeMembersCount * (defaultAmount || 0)).toFixed(2)}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create Event'}</Button>
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
    await updateExpense.mutateAsync({ 
      id: expense.id, 
      name: data.name,
      description: data.description,
      default_amount: data.default_amount,
    });
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
          <DialogTitle>Edit Event</DialogTitle>
          <DialogDescription>Update the event details.</DialogDescription>
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
            <Label htmlFor="edit-default_amount">Fee Per Member (ARS)</Label>
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

function ViewPaymentsDialog({ expense }: { expense: ExtraordinaryExpense }) {
  const [open, setOpen] = useState(false);
  const { payments, isLoading, updatePayment, addMemberToEvent, removeMemberFromEvent } = useEventMemberPayments(expense.id);
  const { memberBalances } = useMembers();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');

  // Get list of members already in the event
  const memberIdsInEvent = new Set(payments.map((p: any) => p.member_id));
  
  // Get active members not in the event
  const membersNotInEvent = memberBalances.filter(m => m.is_active && !memberIdsInEvent.has(m.member_id));

  const handleMarkPaid = async (paymentId: string, amountOwed: number) => {
    await updatePayment.mutateAsync({ id: paymentId, amount_paid: amountOwed });
  };

  const handleToggleMember = async (payment: any) => {
    await removeMemberFromEvent.mutateAsync(payment.id);
  };

  const handleAddMember = async (memberId: string) => {
    await addMemberToEvent.mutateAsync({
      eventId: expense.id,
      memberId,
      amountOwed: expense.default_amount,
    });
  };

  const handleStartEdit = (paymentId: string, currentAmount: number) => {
    setEditingId(paymentId);
    setEditAmount(currentAmount.toString());
  };

  const handleSaveEdit = async (paymentId: string) => {
    const newAmount = parseFloat(editAmount);
    if (!isNaN(newAmount) && newAmount >= 0) {
      await updatePayment.mutateAsync({ id: paymentId, amount_owed: newAmount });
    }
    setEditingId(null);
    setEditAmount('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditAmount('');
  };

  const totalOwed = payments.reduce((sum, p) => sum + Number(p.amount_owed), 0);
  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount_paid), 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon">
          <Users className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{expense.name} - Member Payments</DialogTitle>
          <DialogDescription>
            {payments.length} members assigned • ARS {totalPaid.toFixed(2)} / ARS {totalOwed.toFixed(2)} collected
          </DialogDescription>
        </DialogHeader>
        
        {isLoading ? (
          <div className="text-center py-4">Loading...</div>
        ) : (
          <ScrollArea className="flex-1 h-[60vh]">
            <div className="min-w-[600px] pr-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Include</TableHead>
                    <TableHead className="min-w-[150px]">Member</TableHead>
                    <TableHead className="text-right min-w-[120px]">Fee Owed</TableHead>
                    <TableHead className="text-right min-w-[100px]">Paid</TableHead>
                    <TableHead className="text-center min-w-[80px]">Status</TableHead>
                    <TableHead className="min-w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
              <TableBody>
                {payments.length === 0 && membersNotInEvent.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                      No members available.
                    </TableCell>
                  </TableRow>
                )}
                {payments.map((payment: any) => {
                  const isPaid = Number(payment.amount_paid) >= Number(payment.amount_owed);
                  const isEditing = editingId === payment.id;
                  
                  return (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <Checkbox
                          checked={true}
                          onCheckedChange={() => handleToggleMember(payment)}
                          disabled={isPaid}
                        />
                      </TableCell>
                      <TableCell>{payment.member?.full_name || 'Unknown'}</TableCell>
                      <TableCell className="text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              className="w-24 h-8 text-right"
                              step="0.01"
                              autoFocus
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleSaveEdit(payment.id)}>
                              <Check className="h-4 w-4 text-success" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancelEdit}>
                              <X className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 font-mono"
                            onClick={() => handleStartEdit(payment.id, Number(payment.amount_owed))}
                            disabled={isPaid}
                          >
                            ARS {Number(payment.amount_owed).toFixed(2)}
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">ARS {Number(payment.amount_paid).toFixed(2)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={isPaid ? 'default' : 'destructive'}>
                          {isPaid ? 'Paid' : 'Pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {!isPaid && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleMarkPaid(payment.id, payment.amount_owed)}
                          >
                            Mark Paid
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                
                {/* Members not yet in event */}
                {membersNotInEvent.map((member) => (
                  <TableRow key={member.member_id} className="opacity-60">
                    <TableCell>
                      <Checkbox
                        checked={false}
                        onCheckedChange={() => handleAddMember(member.member_id)}
                      />
                    </TableCell>
                    <TableCell>{member.full_name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      ARS {expense.default_amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">—</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">Not assigned</Badge>
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </ScrollArea>
        )}
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
            This will delete the event and all associated member payment records. This action cannot be undone.
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
          <h1 className="text-2xl font-bold text-foreground">Events & Expenses</h1>
          <p className="text-muted-foreground">Manage events with per-member fees</p>
        </div>
        <AddExpenseDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-primary" />
            Events
          </CardTitle>
          <CardDescription>
            Event fees are automatically added to member balances
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : expenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No events yet. Create your first one!
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Fee/Member</TableHead>
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
                    <TableCell className="text-right">ARS {expense.default_amount.toFixed(2)}</TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={expense.is_active}
                        onCheckedChange={() => handleToggleActive(expense)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <ViewPaymentsDialog expense={expense} />
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
