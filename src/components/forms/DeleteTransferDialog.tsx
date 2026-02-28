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
import { useAccountTransfers } from '@/hooks/useAccountTransfers';
import { AccountTransfer, ACCOUNT_LABELS } from '@/lib/types';
import { formatCurrency, getCurrencyForAccount, parseLocalDate } from '@/lib/utils';
import { format } from 'date-fns';

interface DeleteTransferDialogProps {
  transfer: AccountTransfer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteTransferDialog({
  transfer,
  open,
  onOpenChange,
}: DeleteTransferDialogProps) {
  const { deleteTransfer } = useAccountTransfers();

  const handleDelete = async () => {
    await deleteTransfer.mutateAsync(transfer.id);
    onOpenChange(false);
  };

  const currency = getCurrencyForAccount(transfer.to_account);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Transfer</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this transfer?
            <div className="mt-4 p-3 rounded-lg bg-muted">
              <p className="font-medium">
                {ACCOUNT_LABELS[transfer.from_account]} → {ACCOUNT_LABELS[transfer.to_account]}
              </p>
              <p className="text-sm text-muted-foreground">
                {format(parseLocalDate(transfer.transfer_date), 'MMM d, yyyy')} • {formatCurrency(transfer.amount, currency)}
              </p>
              {transfer.notes && (
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  {transfer.notes}
                </p>
              )}
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
