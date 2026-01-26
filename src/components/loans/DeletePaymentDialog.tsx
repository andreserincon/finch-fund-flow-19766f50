import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loan } from '@/lib/types';
import { LoanPayment, useLoanPayments } from '@/hooks/useLoanPayments';
import { formatCurrency, getCurrencyForAccount } from '@/lib/utils';
import { format } from 'date-fns';

interface DeletePaymentDialogProps {
  payment: LoanPayment;
  loan: Loan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeletePaymentDialog({
  payment,
  loan,
  open,
  onOpenChange,
}: DeletePaymentDialogProps) {
  const { deletePayment } = useLoanPayments(loan.id);
  const currency = getCurrencyForAccount(loan.account);

  const handleDelete = async () => {
    await deletePayment.mutateAsync({
      paymentId: payment.id,
      amount: payment.amount,
      loanId: loan.id,
      transactionId: payment.transaction_id,
    });
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Payment</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this payment of{' '}
            <span className="font-semibold text-foreground">
              {formatCurrency(payment.amount, currency)}
            </span>{' '}
            from{' '}
            <span className="font-semibold text-foreground">
              {format(new Date(payment.payment_date), 'MMM d, yyyy')}
            </span>
            ?
            <br />
            <br />
            This will also delete the associated transaction and update the loan balance.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deletePayment.isPending ? 'Deleting...' : 'Delete Payment'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
