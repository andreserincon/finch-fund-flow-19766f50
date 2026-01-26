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
import { useAccountTransfers } from '@/hooks/useAccountTransfers';
import { AccountType, ACCOUNT_LABELS } from '@/lib/types';
import { ArrowLeft, ArrowLeftRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const transferSchema = z.object({
  transfer_date: z.string().min(1, 'Date is required'),
  amount: z.number().positive('Amount must be positive'),
  from_account: z.enum(['bank', 'great_lodge']),
  to_account: z.enum(['bank', 'great_lodge']),
  notes: z.string().max(500).optional(),
}).refine(data => data.from_account !== data.to_account, {
  message: 'Source and destination accounts must be different',
  path: ['to_account'],
});

type TransferFormData = z.infer<typeof transferSchema>;

export default function AccountTransfer() {
  const navigate = useNavigate();
  const { addTransfer } = useAccountTransfers();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      transfer_date: new Date().toISOString().split('T')[0],
      from_account: 'bank',
      to_account: 'great_lodge',
    },
  });

  const fromAccount = watch('from_account');
  const toAccount = watch('to_account');

  const onSubmit = async (data: TransferFormData) => {
    await addTransfer.mutateAsync({
      transfer_date: data.transfer_date,
      amount: data.amount,
      from_account: data.from_account,
      to_account: data.to_account,
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
          <h1 className="text-2xl font-bold text-foreground">Transfer Funds</h1>
          <p className="text-muted-foreground">Move money between accounts</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-primary" />
            Account Transfer
          </CardTitle>
          <CardDescription>
            Transfer funds between Bank Main Account and Great Lodge Account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Account</Label>
                <Select
                  value={fromAccount}
                  onValueChange={(value: AccountType) => setValue('from_account', value)}
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

              <div className="space-y-2">
                <Label>To Account</Label>
                <Select
                  value={toAccount}
                  onValueChange={(value: AccountType) => setValue('to_account', value)}
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
                {errors.to_account && (
                  <p className="text-sm text-destructive">{errors.to_account.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="transfer_date">Date</Label>
                <Input
                  id="transfer_date"
                  type="date"
                  {...register('transfer_date')}
                />
                {errors.transfer_date && (
                  <p className="text-sm text-destructive">{errors.transfer_date.message}</p>
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
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                {...register('notes')}
                placeholder="Reason for transfer..."
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
                {isSubmitting ? 'Processing...' : 'Complete Transfer'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
