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
import { useTransactions } from '@/hooks/useTransactions';
import { Transaction, CATEGORY_LABELS } from '@/lib/types';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/utils';

interface DeleteTransactionDialogProps {
  transaction: Transaction;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteTransactionDialog({
  transaction,
  open,
  onOpenChange,
}: DeleteTransactionDialogProps) {
  const { deleteTransaction } = useTransactions();

  const handleDelete = async () => {
    await deleteTransaction.mutateAsync(transaction.id);
    onOpenChange(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this transaction?
            <div className="mt-4 p-3 rounded-lg bg-muted">
              <p className="font-medium">{CATEGORY_LABELS[transaction.category]}</p>
              <p className="text-sm text-muted-foreground">
                {format(parseLocalDate(transaction.transaction_date), 'MMM d, yyyy')} • {formatCurrency(transaction.amount)}
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
