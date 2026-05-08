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
  DialogTrigger,
} from '@/components/ui/dialog';
import { useTransactions } from '@/hooks/useTransactions';
import { useMembers } from '@/hooks/useMembers';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useExtraordinaryExpenses } from '@/hooks/useExtraordinaryExpenses';
import { useEventMemberPayments } from '@/hooks/useEventMemberPayments';
import { TransactionType, TransactionCategory, CATEGORY_LABELS, AccountType, ACCOUNT_LABELS } from '@/lib/types';
import { PlusCircle } from 'lucide-react';

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
    account: z.enum(['bank', 'great_lodge', 'savings']),
    member_id: z.string().optional(),
    event_id: z.string().optional(),
    event_member_payment_id: z.string().optional(),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (data) => !EVENT_CATEGORIES.includes(data.category) || !!data.event_id,
    { path: ['event_id'], message: 'Seleccioná un evento' }
  )
  .refine(
    (data) => data.category !== 'event_payment' || !!data.event_member_payment_id,
    { path: ['event_member_payment_id'], message: 'Seleccioná el participante' }
  );

type TransactionFormData = z.infer<typeof transactionSchema>;

interface AddTransactionFormProps {
  defaultType?: TransactionType;
  triggerLabel?: string;
}

export function AddTransactionForm({ 
  defaultType = 'income',
  triggerLabel = 'Add Transaction'
}: AddTransactionFormProps) {
  const [open, setOpen] = useState(false);
  const { addTransaction } = useTransactions();
  const { members } = useMembers();
  const { currentMonthFees } = useMonthlyFees();
  const { expenses: events } = useExtraordinaryExpenses();
  const activeEvents = events.filter((e) => e.is_active);

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
      transaction_type: defaultType,
      category: defaultType === 'income' ? 'monthly_fee' : 'event_expense',
      transaction_date: new Date().toISOString().split('T')[0],
      account: 'bank',
    },
  });

  const transactionType = watch('transaction_type');
  const category = watch('category');
  const selectedAccount = watch('account');
  const selectedEventId = watch('event_id');
  const selectedParticipantId = watch('event_member_payment_id');
  const isEventCategory = EVENT_CATEGORIES.includes(category);
  const isEventPayment = category === 'event_payment';

  // Participants of the selected event (members + guests). Only fetched
  // when the form actually needs them (event_payment category).
  const { payments: eventParticipants } = useEventMemberPayments(
    isEventPayment ? selectedEventId : undefined
  );

  // Reset amount when category changes; pre-fill only for monthly_fee
  useEffect(() => {
    if (category === 'monthly_fee' && currentMonthFees.standard > 0) {
      setValue('amount', currentMonthFees.standard);
    } else {
      setValue('amount', 0);
    }
  }, [category, currentMonthFees.standard, setValue]);

  // Clear event_id when leaving an event-related category
  useEffect(() => {
    if (!isEventCategory && selectedEventId) {
      setValue('event_id', undefined);
    }
  }, [isEventCategory, selectedEventId, setValue]);

  // Clear participant when leaving event_payment or when the event changes
  useEffect(() => {
    if (!isEventPayment && selectedParticipantId) {
      setValue('event_member_payment_id', undefined);
    }
  }, [isEventPayment, selectedParticipantId, setValue]);

  useEffect(() => {
    setValue('event_member_payment_id', undefined);
  }, [selectedEventId, setValue]);

  // Pre-fill amount with the event's default_amount when picking an event
  useEffect(() => {
    if (!isEventCategory || !selectedEventId) return;
    const evt = activeEvents.find((e) => e.id === selectedEventId);
    if (evt && evt.default_amount > 0) {
      setValue('amount', evt.default_amount);
    }
  }, [selectedEventId, isEventCategory, activeEvents, setValue]);

  // When picking a participant, pre-fill amount with their outstanding
  // balance (amount_owed - amount_paid) for the typical "marcar pagado" case
  useEffect(() => {
    if (!isEventPayment || !selectedParticipantId) return;
    const p = eventParticipants.find((row) => row.id === selectedParticipantId);
    if (!p) return;
    const balance = Number(p.amount_owed) - Number(p.amount_paid);
    if (balance > 0) {
      setValue('amount', balance);
    }
  }, [selectedParticipantId, isEventPayment, eventParticipants, setValue]);

  const availableCategories = transactionType === 'income' ? incomeCategories : expenseCategories;

  const onSubmit = async (data: TransactionFormData) => {
    // Resolve member_id from the participant when this is an event payment
    let memberIdToSend: string | null | undefined = data.member_id || null;
    let participantIdToSend: string | null = null;
    if (data.category === 'event_payment' && data.event_member_payment_id) {
      const p = eventParticipants.find((row) => row.id === data.event_member_payment_id);
      participantIdToSend = data.event_member_payment_id;
      memberIdToSend = p?.member_id ?? null;
    }

    await addTransaction.mutateAsync({
      transaction_date: data.transaction_date,
      amount: data.amount,
      transaction_type: data.transaction_type,
      category: data.category,
      account: data.account,
      member_id: memberIdToSend ?? null,
      event_id: EVENT_CATEGORIES.includes(data.category) ? data.event_id || null : null,
      event_member_payment_id: participantIdToSend,
      notes: data.notes || null,
    });
    reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Record Transaction</DialogTitle>
          <DialogDescription>
            Log a new income or expense transaction.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Account</Label>
            <Select
              value={selectedAccount}
              onValueChange={(value: AccountType) => setValue('account', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['bank', 'great_lodge', 'savings'] as AccountType[]).map((acc) => (
                  <SelectItem key={acc} value={acc}>
                    {ACCOUNT_LABELS[acc]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
                onValueChange={(value: TransactionCategory) => setValue('category', value)}
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

          {category === 'monthly_fee' && (
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

          {isEventPayment && selectedEventId && (
            <div className="space-y-2">
              <Label>Participante (miembro o invitado)</Label>
              <Select
                value={selectedParticipantId || ''}
                onValueChange={(value) =>
                  setValue('event_member_payment_id', value || undefined, { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar participante..." />
                </SelectTrigger>
                <SelectContent>
                  {eventParticipants.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      Este evento no tiene participantes asignados todavía.
                    </div>
                  )}
                  {eventParticipants.map((p) => {
                    const name = p.member?.full_name || p.guest_name || 'Sin nombre';
                    const tag = p.member_id ? 'Miembro' : 'Invitado';
                    const balance = Number(p.amount_owed) - Number(p.amount_paid);
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {name} ({tag}) — saldo {balance.toFixed(2)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {errors.event_member_payment_id && (
                <p className="text-sm text-destructive">{errors.event_member_payment_id.message}</p>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Recording...' : 'Record Transaction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
