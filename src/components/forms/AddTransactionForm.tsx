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
import { TransactionType, TransactionCategory, CATEGORY_LABELS, AccountType, ACCOUNT_LABELS } from '@/lib/types';
import { PlusCircle } from 'lucide-react';

const transactionSchema = z.object({
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
  notes: z.string().max(500).optional(),
});

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

  const incomeCategories: TransactionCategory[] = [
    'monthly_fee',
    'extraordinary_income',
    'donation',
    'reimbursement',
    'other_income',
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

  // Reset amount when category changes; pre-fill only for monthly_fee
  useEffect(() => {
    if (category === 'monthly_fee' && currentMonthFees.standard > 0) {
      setValue('amount', currentMonthFees.standard);
    } else {
      setValue('amount', 0);
    }
  }, [category, currentMonthFees.standard, setValue]);

  const availableCategories = transactionType === 'income' ? incomeCategories : expenseCategories;

  const onSubmit = async (data: TransactionFormData) => {
    await addTransaction.mutateAsync({
      transaction_date: data.transaction_date,
      amount: data.amount,
      transaction_type: data.transaction_type,
      category: data.category,
      account: data.account,
      member_id: data.member_id || null,
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
              <Label>Member</Label>
              <Select
                value={watch('member_id') || ''}
                onValueChange={(value) => setValue('member_id', value || undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select member..." />
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
