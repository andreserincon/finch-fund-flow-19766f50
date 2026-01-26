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
import { useLoans } from '@/hooks/useLoans';
import { Loan, ACCOUNT_LABELS, LOAN_STATUS_LABELS } from '@/lib/types';
import { formatCurrency, getCurrencyForAccount } from '@/lib/utils';
import { format } from 'date-fns';

interface DeleteLoanDialogProps {
  loan: Loan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteLoanDialog({ loan, open, onOpenChange }: DeleteLoanDialogProps) {
  const { deleteLoan } = useLoans();

  const handleDelete = async () => {
    await deleteLoan.mutateAsync(loan.id);
    onOpenChange(false);
  };

  const currency = getCurrencyForAccount(loan.account);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Loan</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this loan? This will also delete all associated transactions.
            <div className="mt-4 p-3 rounded-lg bg-muted">
              <p className="font-medium">{loan.member?.full_name}</p>
              <p className="text-sm text-muted-foreground">
                {ACCOUNT_LABELS[loan.account]} • {LOAN_STATUS_LABELS[loan.status]}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(new Date(loan.loan_date), 'MMM d, yyyy')} • {formatCurrency(loan.amount, currency)}
              </p>
            </div>
            <p className="mt-4 text-destructive font-medium">
              This action cannot be undone.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
