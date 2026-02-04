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
import { useExtraordinaryExpenses } from '@/hooks/useExtraordinaryExpenses';
import { useEventMemberPayments } from '@/hooks/useEventMemberPayments';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { TransactionCategory, CATEGORY_LABELS, AccountType, ACCOUNT_LABELS } from '@/lib/types';
import { ArrowLeft, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEffect } from 'react';

const paymentSchema = z.object({
  transaction_date: z.string().min(1, 'Date is required'),
  amount: z.number().positive('Amount must be positive'),
  category: z.enum([
    'monthly_fee',
    'extraordinary_income',
    'donation',
    'reimbursement',
    'other_income',
    'event_payment',
  ]),
  member_id: z.string().optional(),
  event_id: z.string().optional(),
  account: z.enum(['bank', 'great_lodge', 'savings']),
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
  const { expenses } = useExtraordinaryExpenses();
  const { currentMonthFees } = useMonthlyFees();

  // Filter only active events
  const activeEvents = expenses.filter(e => e.is_active);

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
      account: 'bank',
    },
  });

  // Set default amount to current month's standard fee when available
  const currentAmount = watch('amount');
  useEffect(() => {
    if (currentMonthFees.standard > 0 && !currentAmount) {
      setValue('amount', currentMonthFees.standard);
    }
  }, [currentMonthFees.standard, currentAmount, setValue]);

  const category = watch('category');
  const selectedEventId = watch('event_id');
  const selectedMemberId = watch('member_id');
  const selectedAccount = watch('account');

  // Get the selected event to show its default amount
  const selectedEvent = activeEvents.find(e => e.id === selectedEventId);

  const onSubmit = async (data: PaymentFormData) => {
    try {
      // If it's an event payment, update the event_member_payments record
      if (data.category === 'event_payment' && data.event_id && data.member_id) {
        // Find the event_member_payment record for this member and event
        const { data: paymentRecord, error: fetchError } = await supabase
          .from('event_member_payments')
          .select('id, amount_owed')
          .eq('event_id', data.event_id)
          .eq('member_id', data.member_id)
          .maybeSingle();

        if (fetchError) {
          toast.error('Failed to find event payment record');
          return;
        }

        if (!paymentRecord) {
          toast.error('No event fee assigned to this member for the selected event');
          return;
        }

        // Update the event_member_payments record to mark as paid
        const { error: updateError } = await supabase
          .from('event_member_payments')
          .update({ amount_paid: data.amount })
          .eq('id', paymentRecord.id);

        if (updateError) {
          toast.error('Failed to update event payment record');
          return;
        }
      }

      // Log the transaction
      await addTransaction.mutateAsync({
        transaction_date: data.transaction_date,
        amount: data.amount,
        transaction_type: 'income',
        category: data.category,
        member_id: data.member_id === 'guest' ? null : (data.member_id || null),
        account: data.account,
        notes: data.notes || null,
      });

      navigate('/');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error logging payment:', error);
      }
    }
  };

  // Determine if member selection should be shown
  const showMemberSelect = category === 'monthly_fee' || category === 'event_payment';

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
            Log a member payment, event payment, donation, or other income
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
                <Label htmlFor="amount">Amount ({selectedAccount === 'savings' ? 'USD' : 'ARS'})</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  {...register('amount', { valueAsNumber: true })}
                  placeholder={selectedEvent ? selectedEvent.default_amount.toString() : '0.00'}
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
                onValueChange={(value: TransactionCategory) => {
                  setValue('category', value as PaymentFormData['category']);
                  // Reset event_id when changing category
                  if (value !== 'event_payment') {
                    setValue('event_id', undefined);
                  }
                  // Reset member_id when switching away from member-related categories
                  if (value !== 'monthly_fee' && value !== 'event_payment') {
                    setValue('member_id', undefined);
                  }
                }}
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
                  {activeEvents.length > 0 && (
                    <SelectItem value="event_payment">
                      Event Payment
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {category === 'event_payment' && activeEvents.length > 0 && (
              <div className="space-y-2">
                <Label>Event</Label>
                <Select
                  value={selectedEventId || ''}
                  onValueChange={(value) => setValue('event_id', value || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select event..." />
                  </SelectTrigger>
                  <SelectContent>
                    {activeEvents.map((event) => (
                      <SelectItem key={event.id} value={event.id}>
                        {event.name} (ARS {event.default_amount.toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedEvent && (
                  <p className="text-sm text-muted-foreground">
                    Default fee: ARS {selectedEvent.default_amount.toLocaleString()}
                  </p>
                )}
              </div>
            )}

            {showMemberSelect && (
              <div className="space-y-2">
                <Label>Member</Label>
                <Select
                  value={selectedMemberId || ''}
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
                    <SelectItem value="guest" className="text-muted-foreground border-t mt-1 pt-1">
                      Guest
                    </SelectItem>
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
              <Button 
                type="submit" 
                disabled={isSubmitting || (category === 'event_payment' && (!selectedEventId || !selectedMemberId))} 
                className="flex-1"
              >
                {isSubmitting ? 'Recording...' : 'Record Payment'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
