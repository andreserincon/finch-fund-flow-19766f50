import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLoans } from '@/hooks/useLoans';
import { Loan, ACCOUNT_LABELS } from '@/lib/types';
import { formatCurrency, getCurrencyForAccount } from '@/lib/utils';
import { format } from 'date-fns';

interface MarkPaidDialogProps {
  loan: Loan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MarkPaidDialog({ loan, open, onOpenChange }: MarkPaidDialogProps) {
  const { markLoanAsPaid } = useLoans();
  const [paidDate, setPaidDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currency = getCurrencyForAccount(loan.account);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await markLoanAsPaid.mutateAsync({ loanId: loan.id, paidDate });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingDue = loan.amount - loan.amount_paid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Mark Loan as Fully Paid</DialogTitle>
          <DialogDescription>
            This will record a payment of {formatCurrency(remainingDue, currency)} to fully pay off the loan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 rounded-lg bg-muted">
            <p className="font-medium">{loan.member?.full_name}</p>
            <p className="text-sm text-muted-foreground">
              {ACCOUNT_LABELS[loan.account]} • {format(new Date(loan.loan_date), 'MMM d, yyyy')}
            </p>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <p className="text-xs text-muted-foreground">Total Loan</p>
                <p className="font-mono font-semibold">{formatCurrency(loan.amount, currency)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Already Paid</p>
                <p className="font-mono font-semibold text-success">{formatCurrency(loan.amount_paid, currency)}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground">Remaining to Pay</p>
              <p className="text-lg font-mono font-bold text-warning">
                {formatCurrency(remainingDue, currency)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="paid_date">Payment Date</Label>
            <Input
              id="paid_date"
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? 'Processing...' : 'Confirm Payment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
