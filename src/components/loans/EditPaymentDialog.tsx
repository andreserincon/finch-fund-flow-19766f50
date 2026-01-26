import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loan } from '@/lib/types';
import { LoanPayment, useLoanPayments } from '@/hooks/useLoanPayments';
import { formatCurrency, getCurrencyForAccount } from '@/lib/utils';

const formSchema = z.object({
  amount: z.coerce.number().positive('Amount must be positive'),
  payment_date: z.string().min(1, 'Date is required'),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface EditPaymentDialogProps {
  payment: LoanPayment;
  loan: Loan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditPaymentDialog({
  payment,
  loan,
  open,
  onOpenChange,
}: EditPaymentDialogProps) {
  const { updatePayment } = useLoanPayments(loan.id);
  const currency = getCurrencyForAccount(loan.account);

  // Calculate max amount (remaining due + current payment amount)
  const remainingDue = loan.amount - loan.amount_paid;
  const maxAmount = remainingDue + payment.amount;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      amount: payment.amount,
      payment_date: payment.payment_date,
      notes: payment.notes || '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (values.amount > maxAmount) {
      form.setError('amount', {
        message: `Amount cannot exceed ${formatCurrency(maxAmount, currency)}`,
      });
      return;
    }

    await updatePayment.mutateAsync({
      paymentId: payment.id,
      amount: values.amount,
      paymentDate: values.payment_date,
      notes: values.notes || null,
      oldAmount: payment.amount,
      loanId: loan.id,
      transactionId: payment.transaction_id,
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Payment</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Amount ({currency})</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={maxAmount}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-muted-foreground">
                    Max: {formatCurrency(maxAmount, currency)}
                  </p>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="payment_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Payment Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any notes about this payment..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updatePayment.isPending}>
                {updatePayment.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
