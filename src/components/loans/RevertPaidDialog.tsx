import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLoans } from '@/hooks/useLoans';
import { Loan, ACCOUNT_LABELS } from '@/lib/types';
import { formatCurrency, getCurrencyForAccount } from '@/lib/utils';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';

interface RevertPaidDialogProps {
  loan: Loan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RevertPaidDialog({ loan, open, onOpenChange }: RevertPaidDialogProps) {
  const { revertLoanToPending } = useLoans();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currency = getCurrencyForAccount(loan.account);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await revertLoanToPending.mutateAsync(loan.id);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Revert to Active
          </DialogTitle>
          <DialogDescription>
            This will undo the "Mark as Fully Paid" action and restore the loan to active status.
          </DialogDescription>
        </DialogHeader>
        
        <div className="p-4 rounded-lg bg-muted">
          <p className="font-medium">{loan.member?.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {ACCOUNT_LABELS[loan.account]} • {format(new Date(loan.loan_date), 'MMM d, yyyy')}
          </p>
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground">Loan Amount</p>
            <p className="text-lg font-mono font-bold">
              {formatCurrency(loan.amount, currency)}
            </p>
          </div>
        </div>

        <div className="text-sm text-muted-foreground bg-warning/10 p-3 rounded-lg">
          <p>This action will:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Delete the final payment record</li>
            <li>Remove the associated transaction</li>
            <li>Set the loan status back to "Active"</li>
          </ul>
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting} 
            variant="destructive"
            className="flex-1"
          >
            {isSubmitting ? 'Reverting...' : 'Revert to Active'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
