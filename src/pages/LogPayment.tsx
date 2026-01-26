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
import { useMembers } from '@/hooks/useMembers';
import { TransactionCategory, CATEGORY_LABELS } from '@/lib/types';
import { ArrowLeft, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

const paymentSchema = z.object({
  transaction_date: z.string().min(1, 'Date is required'),
  amount: z.number().positive('Amount must be positive'),
  category: z.enum([
    'monthly_fee',
    'extraordinary_income',
    'donation',
    'reimbursement',
    'other_income',
  ]),
  member_id: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

const incomeCategories: TransactionCategory[] = [
  'monthly_fee',
  'extraordinary_income',
  'donation',
  'reimbursement',
  'other_income',
];

export default function LogPayment() {
  const navigate = useNavigate();
  const { addTransaction } = useTransactions();
  const { members } = useMembers();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      transaction_date: new Date().toISOString().split('T')[0],
      category: 'monthly_fee',
    },
  });

  const category = watch('category');

  const onSubmit = async (data: PaymentFormData) => {
    await addTransaction.mutateAsync({
      transaction_date: data.transaction_date,
      amount: data.amount,
      transaction_type: 'income',
      category: data.category,
      member_id: data.member_id || null,
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
          <h1 className="text-2xl font-bold text-foreground">Log Payment</h1>
          <p className="text-muted-foreground">Record an income transaction</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-success" />
            New Income
          </CardTitle>
          <CardDescription>
            Log a member payment, donation, or other income
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
                <Label htmlFor="amount">Amount (€)</Label>
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
                onValueChange={(value: TransactionCategory) => setValue('category', value as PaymentFormData['category'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {incomeCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                placeholder="Additional details about this payment..."
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
                {isSubmitting ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
