import { useState } from 'react';
import { useLoans } from '@/hooks/useLoans';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { AddLoanDialog } from '@/components/loans/AddLoanDialog';
import { MarkPaidDialog } from '@/components/loans/MarkPaidDialog';
import { DeleteLoanDialog } from '@/components/loans/DeleteLoanDialog';
import { AddPaymentDialog } from '@/components/loans/AddPaymentDialog';
import { PaymentHistoryDialog } from '@/components/loans/PaymentHistoryDialog';
import { RevertPaidDialog } from '@/components/loans/RevertPaidDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MoreHorizontal, Plus, CheckCircle, XCircle, Trash2, DollarSign, History, Undo2 } from 'lucide-react';
import { format } from 'date-fns';
import { Loan, ACCOUNT_LABELS, LOAN_STATUS_LABELS, LoanStatus } from '@/lib/types';
import { formatCurrency, getCurrencyForAccount, cn, parseLocalDate } from '@/lib/utils';

export default function Loans() {
  const { loans, isLoading, cancelLoan } = useLoans();
  const { isAdmin } = useIsAdmin();
  const [showPaid, setShowPaid] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [markingPaidLoan, setMarkingPaidLoan] = useState<Loan | null>(null);
  const [deletingLoan, setDeletingLoan] = useState<Loan | null>(null);
  const [addingPaymentLoan, setAddingPaymentLoan] = useState<Loan | null>(null);
  const [viewingHistoryLoan, setViewingHistoryLoan] = useState<Loan | null>(null);
  const [revertingLoan, setRevertingLoan] = useState<Loan | null>(null);

  const filteredLoans = showPaid
    ? loans
        .filter((loan) => loan.status === 'paid')
        .sort((a, b) => {
          const dateA = a.paid_date ? new Date(a.paid_date).getTime() : 0;
          const dateB = b.paid_date ? new Date(b.paid_date).getTime() : 0;
          return dateB - dateA;
        })
    : loans
        .filter((loan) => loan.status === 'active')
        .sort((a, b) => b.amount - a.amount);

  // Calculate totals for active loans
  const activeLoansARS = loans.filter((l) => l.status === 'active' && l.account !== 'savings');
  const activeLoansUSD = loans.filter((l) => l.status === 'active' && l.account === 'savings');

  const totalDueARS = activeLoansARS.reduce((sum, l) => sum + l.amount, 0);
  const totalPaidARS = activeLoansARS.reduce((sum, l) => sum + l.amount_paid, 0);
  const remainingDueARS = totalDueARS - totalPaidARS;

  const totalDueUSD = activeLoansUSD.reduce((sum, l) => sum + l.amount, 0);
  const totalPaidUSD = activeLoansUSD.reduce((sum, l) => sum + l.amount_paid, 0);
  const remainingDueUSD = totalDueUSD - totalPaidUSD;

  const getStatusBadge = (status: LoanStatus) => {
    const variants: Record<LoanStatus, string> = {
      active: 'bg-warning/10 text-warning hover:bg-warning/20',
      paid: 'bg-success/10 text-success hover:bg-success/20',
      cancelled: 'bg-muted text-muted-foreground hover:bg-muted/80',
    };
    return (
      <Badge className={cn(variants[status])}>
        {LOAN_STATUS_LABELS[status]}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Loans</h1>
          <p className="text-sm text-muted-foreground">
            Manage member loans and track repayments
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Loan
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        <div className="stat-card space-y-3">
          <div className="flex justify-between items-start">
            <p className="text-sm text-muted-foreground">Active Loans (ARS)</p>
            <Badge variant="outline" className="text-xs">
              {activeLoansARS.length} loans
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Due</p>
              <p className="text-lg font-bold font-mono">{formatCurrency(totalDueARS, 'ARS')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="text-lg font-bold font-mono text-success">{formatCurrency(totalPaidARS, 'ARS')}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className="text-xl font-bold font-mono text-warning">{formatCurrency(remainingDueARS, 'ARS')}</p>
          </div>
        </div>
        <div className="stat-card space-y-3">
          <div className="flex justify-between items-start">
            <p className="text-sm text-muted-foreground">Active Loans (USD)</p>
            <Badge variant="outline" className="text-xs">
              {activeLoansUSD.length} loans
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Due</p>
              <p className="text-lg font-bold font-mono">{formatCurrency(totalDueUSD, 'USD')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="text-lg font-bold font-mono text-success">{formatCurrency(totalPaidUSD, 'USD')}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className="text-xl font-bold font-mono text-warning">{formatCurrency(remainingDueUSD, 'USD')}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Switch
          id="show-paid"
          checked={showPaid}
          onCheckedChange={setShowPaid}
        />
        <Label htmlFor="show-paid" className="text-sm cursor-pointer">
          Show paid loans
        </Label>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredLoans.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-card rounded-lg border">
            No loans found
          </div>
        ) : (
          filteredLoans.map((loan) => {
            const currency = getCurrencyForAccount(loan.account);
            const remainingDue = loan.amount - loan.amount_paid;
            const paidPercentage = (loan.amount_paid / loan.amount) * 100;
            return (
              <div key={loan.id} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{loan.member?.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(parseLocalDate(loan.loan_date), 'MMM d, yyyy')}
                      {' • '}{ACCOUNT_LABELS[loan.account]}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(loan.status)}
                    {isAdmin ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover">
                          {loan.status === 'active' && (
                            <>
                              <DropdownMenuItem onClick={() => setAddingPaymentLoan(loan)}>
                                <DollarSign className="mr-2 h-4 w-4" />
                                Add Payment
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setViewingHistoryLoan(loan)}>
                                <History className="mr-2 h-4 w-4" />
                                View History
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setMarkingPaidLoan(loan)}>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Mark as Fully Paid
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => cancelLoan.mutate(loan.id)}
                                className="text-warning focus:text-warning"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Cancel Loan
                              </DropdownMenuItem>
                            </>
                          )}
                          {loan.status === 'paid' && (
                            <>
                              <DropdownMenuItem onClick={() => setViewingHistoryLoan(loan)}>
                                <History className="mr-2 h-4 w-4" />
                                View History
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setRevertingLoan(loan)}>
                                <Undo2 className="mr-2 h-4 w-4" />
                                Revert to Active
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem
                            onClick={() => setDeletingLoan(loan)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingHistoryLoan(loan)}>
                        <History className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                
                {/* Payment Progress */}
                {loan.status === 'active' && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Paid: {formatCurrency(loan.amount_paid, currency)}
                      </span>
                      <span className="font-medium">{paidPercentage.toFixed(0)}%</span>
                    </div>
                    <Progress value={paidPercentage} className="h-1.5" />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">
                      {loan.status === 'active' ? 'Remaining Due' : 'Total'}
                    </p>
                    <span className={cn(
                      "font-mono text-lg font-semibold",
                      loan.status === 'active' && remainingDue > 0 && "text-warning"
                    )}>
                      {formatCurrency(loan.status === 'active' ? remainingDue : loan.amount, currency)}
                    </span>
                  </div>
                  {loan.paid_date && (
                    <span className="text-xs text-muted-foreground">
                      Paid: {format(parseLocalDate(loan.paid_date), 'MMM d, yyyy')}
                    </span>
                  )}
                </div>
                {loan.notes && (
                  <p className="text-sm text-muted-foreground truncate">{loan.notes}</p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLoans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No loans found
                </TableCell>
              </TableRow>
            ) : (
              filteredLoans.map((loan) => {
                const currency = getCurrencyForAccount(loan.account);
                const remainingDue = loan.amount - loan.amount_paid;
                const paidPercentage = (loan.amount_paid / loan.amount) * 100;
                return (
                  <TableRow key={loan.id}>
                    <TableCell className="font-medium">
                      {format(parseLocalDate(loan.loan_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>{loan.member?.full_name}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {ACCOUNT_LABELS[loan.account]}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono">
                      {formatCurrency(loan.amount, currency)}
                    </TableCell>
                    <TableCell className="font-mono text-success">
                      {formatCurrency(loan.amount_paid, currency)}
                      {loan.status === 'active' && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({paidPercentage.toFixed(0)}%)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={cn("font-mono font-semibold", loan.status === 'active' && remainingDue > 0 && "text-warning")}>
                      {formatCurrency(remainingDue, currency)}
                    </TableCell>
                    <TableCell>{getStatusBadge(loan.status)}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-muted-foreground">
                      {loan.notes || '—'}
                    </TableCell>
                    {isAdmin ? (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Open menu</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            {loan.status === 'active' && (
                              <>
                                <DropdownMenuItem onClick={() => setAddingPaymentLoan(loan)}>
                                  <DollarSign className="mr-2 h-4 w-4" />
                                  Add Payment
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setViewingHistoryLoan(loan)}>
                                  <History className="mr-2 h-4 w-4" />
                                  View History
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setMarkingPaidLoan(loan)}>
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Mark as Fully Paid
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => cancelLoan.mutate(loan.id)}
                                  className="text-warning focus:text-warning"
                                >
                                  <XCircle className="mr-2 h-4 w-4" />
                                  Cancel Loan
                                </DropdownMenuItem>
                              </>
                            )}
                            {loan.status === 'paid' && (
                              <>
                                <DropdownMenuItem onClick={() => setViewingHistoryLoan(loan)}>
                                  <History className="mr-2 h-4 w-4" />
                                  View History
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setRevertingLoan(loan)}>
                                  <Undo2 className="mr-2 h-4 w-4" />
                                  Revert to Active
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem
                              onClick={() => setDeletingLoan(loan)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    ) : (
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setViewingHistoryLoan(loan)}>
                          <History className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialogs */}
      <AddLoanDialog open={showAddDialog} onOpenChange={setShowAddDialog} />

      {markingPaidLoan && (
        <MarkPaidDialog
          loan={markingPaidLoan}
          open={!!markingPaidLoan}
          onOpenChange={(open) => !open && setMarkingPaidLoan(null)}
        />
      )}

      {deletingLoan && (
        <DeleteLoanDialog
          loan={deletingLoan}
          open={!!deletingLoan}
          onOpenChange={(open) => !open && setDeletingLoan(null)}
        />
      )}

      {addingPaymentLoan && (
        <AddPaymentDialog
          loan={addingPaymentLoan}
          open={!!addingPaymentLoan}
          onOpenChange={(open) => !open && setAddingPaymentLoan(null)}
        />
      )}

      {viewingHistoryLoan && (
        <PaymentHistoryDialog
          loan={viewingHistoryLoan}
          open={!!viewingHistoryLoan}
          onOpenChange={(open) => !open && setViewingHistoryLoan(null)}
        />
      )}

      {revertingLoan && (
        <RevertPaidDialog
          loan={revertingLoan}
          open={!!revertingLoan}
          onOpenChange={(open) => !open && setRevertingLoan(null)}
        />
      )}
    </div>
  );
}
