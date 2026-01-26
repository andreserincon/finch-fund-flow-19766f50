import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTransactions } from '@/hooks/useTransactions';
import { TransactionCategory, CATEGORY_LABELS, AccountType, ACCOUNT_LABELS } from '@/lib/types';
import { ArrowLeft, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';

const expenseSchema = z.object({
  transaction_date: z.string().min(1, 'Date is required'),
  amount: z.number().positive('Amount must be positive'),
  category: z.enum([
    'event_expense',
    'parent_organization_fee',
    'other_expense',
  ]),
  account: z.enum(['bank', 'great_lodge']),
  notes: z.string().max(500).optional(),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

const expenseCategories: TransactionCategory[] = [
  'event_expense',
  'parent_organization_fee',
  'other_expense',
];

export default function LogExpense() {
  const navigate = useNavigate();
  const { addTransaction } = useTransactions();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      transaction_date: new Date().toISOString().split('T')[0],
      category: 'event_expense',
      account: 'bank',
    },
  });

  const category = watch('category');
  const selectedAccount = watch('account');

  const onSubmit = async (data: ExpenseFormData) => {
    await addTransaction.mutateAsync({
      transaction_date: data.transaction_date,
      amount: data.amount,
      transaction_type: 'expense',
      category: data.category,
      member_id: null,
      account: data.account,
      notes: data.notes || null,
    });
    navigate('/');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <Link to="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Log Expense</h1>
          <p className="text-muted-foreground">Record an expense transaction</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-overdue" />
            New Expense
          </CardTitle>
          <CardDescription>
            Log an event expense, parent organization fee, or other expense
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                  {(['bank', 'great_lodge'] as AccountType[]).map((acc) => (
                    <SelectItem key={acc} value={acc}>
                      {ACCOUNT_LABELS[acc]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
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

              <div className="space-y-2">
                <Label htmlFor="amount">Amount ($)</Label>
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
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(value: TransactionCategory) => setValue('category', value as ExpenseFormData['category'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                {...register('notes')}
                placeholder="Additional details about this expense..."
                rows={3}
              />
              {errors.notes && (
                <p className="text-sm text-destructive">{errors.notes.message}</p>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate('/')}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? 'Recording...' : 'Record Expense'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
