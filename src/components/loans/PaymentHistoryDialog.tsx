import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Loan, ACCOUNT_LABELS } from '@/lib/types';
import { useLoanPayments, LoanPayment } from '@/hooks/useLoanPayments';
import { formatCurrency, getCurrencyForAccount, parseLocalDate } from '@/lib/utils';
import { EditPaymentDialog } from './EditPaymentDialog';
import { DeletePaymentDialog } from './DeletePaymentDialog';

interface PaymentHistoryDialogProps {
  loan: Loan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaymentHistoryDialog({
  loan,
  open,
  onOpenChange,
}: PaymentHistoryDialogProps) {
  const { payments, isLoading } = useLoanPayments(loan.id);
  const [editingPayment, setEditingPayment] = useState<LoanPayment | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<LoanPayment | null>(null);

  const currency = getCurrencyForAccount(loan.account);
  const remainingDue = loan.amount - loan.amount_paid;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Payment History</DialogTitle>
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground pt-2">
              <span>{loan.member?.full_name}</span>
              <span>•</span>
              <span>{ACCOUNT_LABELS[loan.account]}</span>
              <span>•</span>
              <Badge variant="outline">
                {formatCurrency(loan.amount_paid, currency)} / {formatCurrency(loan.amount, currency)}
              </Badge>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-pulse text-muted-foreground">Loading...</div>
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No payments recorded yet
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                  {payments.map((payment) => (
                    <div key={payment.id} className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-mono font-semibold text-success">
                            +{formatCurrency(payment.amount, currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(parseLocalDate(payment.payment_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem onClick={() => setEditingPayment(payment)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeletingPayment(payment)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {payment.notes && (
                        <p className="text-sm text-muted-foreground">{payment.notes}</p>
                      )}
                    </div>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            {format(parseLocalDate(payment.payment_date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="font-mono text-success">
                            +{formatCurrency(payment.amount, currency)}
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">
                            {payment.notes || '—'}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-popover">
                                <DropdownMenuItem onClick={() => setEditingPayment(payment)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setDeletingPayment(payment)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>

          {/* Summary Footer */}
          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {payments.length} payment{payments.length !== 1 ? 's' : ''}
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Remaining Due</p>
              <p className={`font-mono font-semibold ${remainingDue > 0 ? 'text-warning' : 'text-success'}`}>
                {formatCurrency(remainingDue, currency)}
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {editingPayment && (
        <EditPaymentDialog
          payment={editingPayment}
          loan={loan}
          open={!!editingPayment}
          onOpenChange={(open) => !open && setEditingPayment(null)}
        />
      )}

      {deletingPayment && (
        <DeletePaymentDialog
          payment={deletingPayment}
          loan={loan}
          open={!!deletingPayment}
          onOpenChange={(open) => !open && setDeletingPayment(null)}
        />
      )}
    </>
  );
}
