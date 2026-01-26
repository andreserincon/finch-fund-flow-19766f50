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
import { Progress } from '@/components/ui/progress';

interface AddPaymentDialogProps {
  loan: Loan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddPaymentDialog({ loan, open, onOpenChange }: AddPaymentDialogProps) {
  const { addLoanPayment } = useLoans();
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currency = getCurrencyForAccount(loan.account);
  const remainingDue = loan.amount - loan.amount_paid;
  const paidPercentage = (loan.amount_paid / loan.amount) * 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    setIsSubmitting(true);
    try {
      await addLoanPayment.mutateAsync({ 
        loanId: loan.id, 
        paymentAmount: amount,
        paymentDate 
      });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePayFullAmount = () => {
    setPaymentAmount(remainingDue.toString());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Record Loan Payment</DialogTitle>
          <DialogDescription>
            Add a partial or full payment to this loan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-4 rounded-lg bg-muted space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">{loan.member?.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  {ACCOUNT_LABELS[loan.account]} • {format(new Date(loan.loan_date), 'MMM d, yyyy')}
                </p>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{paidPercentage.toFixed(0)}%</span>
              </div>
              <Progress value={paidPercentage} className="h-2" />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <p className="text-xs text-muted-foreground">Total Loan</p>
                <p className="font-mono font-semibold">
                  {formatCurrency(loan.amount, currency)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Paid</p>
                <p className="font-mono font-semibold text-success">
                  {formatCurrency(loan.amount_paid, currency)}
                </p>
              </div>
            </div>
            
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground">Remaining Due</p>
              <p className="text-lg font-mono font-bold text-warning">
                {formatCurrency(remainingDue, currency)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payment_date">Payment Date</Label>
            <Input
              id="payment_date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="payment_amount">Payment Amount</Label>
              <Button 
                type="button" 
                variant="link" 
                size="sm" 
                className="h-auto p-0 text-xs"
                onClick={handlePayFullAmount}
              >
                Pay full amount
              </Button>
            </div>
            <Input
              id="payment_amount"
              type="number"
              step="0.01"
              min="0.01"
              max={remainingDue}
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder={`Max: ${formatCurrency(remainingDue, currency)}`}
              required
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting || !paymentAmount || parseFloat(paymentAmount) <= 0} 
              className="flex-1"
            >
              {isSubmitting ? 'Processing...' : 'Record Payment'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}