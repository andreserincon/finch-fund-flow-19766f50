import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
} from '@/components/ui/dialog';
import { useTransactions } from '@/hooks/useTransactions';
import { useMembers } from '@/hooks/useMembers';
import { useExtraordinaryExpenses } from '@/hooks/useExtraordinaryExpenses';
import { Transaction, TransactionType, TransactionCategory, CATEGORY_LABELS } from '@/lib/types';

const EVENT_CATEGORIES: TransactionCategory[] = ['event_expense', 'event_payment'];

const transactionSchema = z
  .object({
    transaction_date: z.string().min(1, 'Date is required'),
    amount: z.number().positive('Amount must be positive'),
    transaction_type: z.enum(['income', 'expense']),
    category: z.enum([
      'monthly_fee',
      'extraordinary_income',
      'donation',
      'reimbursement',
      'event_expense',
      'parent_organization_fee',
      'other_expense',
      'other_income',
      'event_payment',
      'loan_disbursement',
      'loan_repayment',
      'account_yield',
    ]),
    member_id: z.string().optional(),
    event_id: z.string().optional(),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (data) => !EVENT_CATEGORIES.includes(data.category) || !!data.event_id,
    { path: ['event_id'], message: 'Seleccioná un evento' }
  );

type TransactionFormData = z.infer<typeof transactionSchema>;

interface EditTransactionDialogProps {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTransactionDialog({ 
  transaction,
  open,
  onOpenChange,
}: EditTransactionDialogProps) {
  const { updateTransaction } = useTransactions();
  const { members } = useMembers();
  const { expenses: events } = useExtraordinaryExpenses();
  const activeEvents = events.filter(
    (e) => e.is_active || e.id === transaction.event_id
  );

  const incomeCategories: TransactionCategory[] = [
    'monthly_fee',
    'extraordinary_income',
    'donation',
    'reimbursement',
    'other_income',
    'event_payment',
    'account_yield',
  ];

  const expenseCategories: TransactionCategory[] = [
    'event_expense',
    'parent_organization_fee',
    'other_expense',
  ];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transaction_type: transaction.transaction_type,
      category: transaction.category,
      transaction_date: transaction.transaction_date,
      amount: transaction.amount,
      member_id: transaction.member_id || undefined,
      event_id: transaction.event_id || undefined,
      notes: transaction.notes || undefined,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        transaction_type: transaction.transaction_type,
        category: transaction.category,
        transaction_date: transaction.transaction_date,
        amount: transaction.amount,
        member_id: transaction.member_id || undefined,
        event_id: transaction.event_id || undefined,
        notes: transaction.notes || undefined,
      });
    }
  }, [open, transaction, reset]);

  const transactionType = watch('transaction_type');
  const category = watch('category');
  const selectedEventId = watch('event_id');
  const isEventCategory = EVENT_CATEGORIES.includes(category);

  // Clear event_id when category leaves the event-related set
  useEffect(() => {
    if (!isEventCategory && selectedEventId) {
      setValue('event_id', undefined);
    }
  }, [isEventCategory, selectedEventId, setValue]);

  const availableCategories = transactionType === 'income' ? incomeCategories : expenseCategories;

  const onSubmit = async (data: TransactionFormData) => {
    await updateTransaction.mutateAsync({
      id: transaction.id,
      transaction_date: data.transaction_date,
      amount: data.amount,
      transaction_type: data.transaction_type,
      category: data.category,
      member_id: data.member_id || null,
      event_id: EVENT_CATEGORIES.includes(data.category) ? data.event_id || null : null,
      notes: data.notes || null,
    });
    onOpenChange(false);
  };

  const showMemberSelect = category === 'monthly_fee' || category === 'event_payment';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Transaction</DialogTitle>
          <DialogDescription>
            Update the transaction details.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={transactionType}
                onValueChange={(value: TransactionType) => {
                  setValue('transaction_type', value);
                  setValue('category', value === 'income' ? 'monthly_fee' : 'event_expense');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="transaction_date">Date</Label>
              <Input
                id="transaction_date"
                type="date"
                {...register('transaction_date')}
              />
              {errors.transaction_date && (
                <p className="text-sm text-destructive">{errors.transaction_date.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                {...register('amount', { valueAsNumber: true })}
                placeholder="0.00"
              />
              {errors.amount && (
                <p className="text-sm text-destructive">{errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(value: TransactionCategory) => setValue('category', value as TransactionFormData['category'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {showMemberSelect && (
            <div className="space-y-2">
              <Label>Miembro</Label>
              <Select
                value={watch('member_id') || ''}
                onValueChange={(value) => setValue('member_id', value || undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar miembro..." />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isEventCategory && (
            <div className="space-y-2">
              <Label>Evento</Label>
              <Select
                value={selectedEventId || ''}
                onValueChange={(value) => setValue('event_id', value || undefined, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar evento..." />
                </SelectTrigger>
                <SelectContent>
                  {activeEvents.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No hay eventos activos
                    </div>
                  )}
                  {activeEvents.map((evt) => (
                    <SelectItem key={evt.id} value={evt.id}>
                      {evt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.event_id && (
                <p className="text-sm text-destructive">{errors.event_id.message}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="Additional details..."
              rows={3}
            />
            {errors.notes && (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
