import { useState } from 'react';
import { useLoans } from '@/hooks/useLoans';
import { useMembers } from '@/hooks/useMembers';
import { AddLoanDialog } from '@/components/loans/AddLoanDialog';
import { MarkPaidDialog } from '@/components/loans/MarkPaidDialog';
import { DeleteLoanDialog } from '@/components/loans/DeleteLoanDialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MoreHorizontal, Plus, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Loan, ACCOUNT_LABELS, LOAN_STATUS_LABELS, LoanStatus } from '@/lib/types';
import { formatCurrency, getCurrencyForAccount, cn } from '@/lib/utils';

export default function Loans() {
  const { loans, isLoading, cancelLoan } = useLoans();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [markingPaidLoan, setMarkingPaidLoan] = useState<Loan | null>(null);
  const [deletingLoan, setDeletingLoan] = useState<Loan | null>(null);

  const filteredLoans = loans.filter((loan) => {
    if (statusFilter === 'all') return true;
    return loan.status === statusFilter;
  });

  // Calculate totals
  const activeLoansARS = loans
    .filter((l) => l.status === 'active' && l.account !== 'savings')
    .reduce((sum, l) => sum + l.amount, 0);

  const activeLoansUSD = loans
    .filter((l) => l.status === 'active' && l.account === 'savings')
    .reduce((sum, l) => sum + l.amount, 0);

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
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Loan
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Active Loans (ARS)</p>
          <p className="text-2xl font-bold text-warning">
            {formatCurrency(activeLoansARS, 'ARS')}
          </p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">Active Loans (USD)</p>
          <p className="text-2xl font-bold text-warning">
            {formatCurrency(activeLoansUSD, 'USD')}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
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
            return (
              <div key={loan.id} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{loan.member?.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(loan.loan_date), 'MMM d, yyyy')}
                      {' • '}{ACCOUNT_LABELS[loan.account]}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(loan.status)}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover">
                        {loan.status === 'active' && (
                          <>
                            <DropdownMenuItem onClick={() => setMarkingPaidLoan(loan)}>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Mark as Paid
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
                        <DropdownMenuItem
                          onClick={() => setDeletingLoan(loan)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-lg font-semibold">
                    {formatCurrency(loan.amount, currency)}
                  </span>
                  {loan.paid_date && (
                    <span className="text-xs text-muted-foreground">
                      Paid: {format(new Date(loan.paid_date), 'MMM d, yyyy')}
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
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Paid Date</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLoans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No loans found
                </TableCell>
              </TableRow>
            ) : (
              filteredLoans.map((loan) => {
                const currency = getCurrencyForAccount(loan.account);
                return (
                  <TableRow key={loan.id}>
                    <TableCell className="font-medium">
                      {format(new Date(loan.loan_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>{loan.member?.full_name}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {ACCOUNT_LABELS[loan.account]}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono font-semibold">
                      {formatCurrency(loan.amount, currency)}
                    </TableCell>
                    <TableCell>{getStatusBadge(loan.status)}</TableCell>
                    <TableCell>
                      {loan.paid_date
                        ? format(new Date(loan.paid_date), 'MMM d, yyyy')
                        : '—'}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate text-muted-foreground">
                      {loan.notes || '—'}
                    </TableCell>
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
                              <DropdownMenuItem onClick={() => setMarkingPaidLoan(loan)}>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Mark as Paid
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
    </div>
  );
}
