import { useState } from 'react';
import { useLoans } from '@/hooks/useLoans';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { AddLoanDialog } from '@/components/loans/AddLoanDialog';
import { MarkPaidDialog } from '@/components/loans/MarkPaidDialog';
import { DeleteLoanDialog } from '@/components/loans/DeleteLoanDialog';
import { AddPaymentDialog } from '@/components/loans/AddPaymentDialog';
import { PaymentHistoryDialog } from '@/components/loans/PaymentHistoryDialog';
import { RevertPaidDialog } from '@/components/loans/RevertPaidDialog';
import { EditLoanDialog } from '@/components/loans/EditLoanDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MoreHorizontal, Plus, CheckCircle, XCircle, Trash2, DollarSign, History, Undo2, Pencil, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Loan, ACCOUNT_LABELS, LOAN_STATUS_LABELS, LoanStatus } from '@/lib/types';
import { formatCurrency, getCurrencyForAccount, cn, parseLocalDate } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/ui/loading';

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
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);

  // Sort state. null column = the default order (active by amount, paid by paid date).
  type SortColumn = 'date' | 'member' | 'total' | 'remaining';
  const [sortConfig, setSortConfig] = useState<{ column: SortColumn | null; direction: 'asc' | 'desc' }>({
    column: null,
    direction: 'asc',
  });
  const handleSort = (column: SortColumn) => {
    setSortConfig((prev) => ({ column, direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };
  const getSortIcon = (column: SortColumn) => {
    if (sortConfig.column !== column) return <ArrowUpDown className="ml-1 h-4 w-4" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  const baseLoans = loans.filter((loan) => loan.status === (showPaid ? 'paid' : 'active'));
  const filteredLoans = [...baseLoans].sort((a, b) => {
    if (!sortConfig.column) {
      if (showPaid) {
        const dateA = a.paid_date ? new Date(a.paid_date).getTime() : 0;
        const dateB = b.paid_date ? new Date(b.paid_date).getTime() : 0;
        return dateB - dateA;
      }
      return b.amount - a.amount;
    }
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    switch (sortConfig.column) {
      case 'date': return direction * (parseLocalDate(a.loan_date).getTime() - parseLocalDate(b.loan_date).getTime());
      case 'member': return direction * (a.member?.full_name || '').localeCompare(b.member?.full_name || '');
      case 'total': return direction * (a.amount - b.amount);
      case 'remaining': return direction * ((a.amount - a.amount_paid) - (b.amount - b.amount_paid));
      default: return 0;
    }
  });

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
    return <Badge className={cn(variants[status])}>{LOAN_STATUS_LABELS[status]}</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <Skeleton className="h-7 w-44" />
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <TableSkeleton rows={6} cols={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground font-display">Préstamos</h1>
          <p className="text-sm text-muted-foreground">
            Gestionar préstamos de miembros y seguimiento de pagos
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Préstamo
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        <div className="stat-card space-y-3">
          <div className="flex justify-between items-start">
            <p className="text-sm text-muted-foreground">Préstamos Activos (ARS)</p>
            <Badge variant="outline" className="text-xs">{activeLoansARS.length} préstamos</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Adeudado</p>
              <p className="text-lg font-bold font-mono">{formatCurrency(totalDueARS, 'ARS')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagado</p>
              <p className="text-lg font-bold font-mono text-success">{formatCurrency(totalPaidARS, 'ARS')}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pendiente</p>
            <p className="text-xl font-bold font-mono text-warning">{formatCurrency(remainingDueARS, 'ARS')}</p>
          </div>
        </div>
        <div className="stat-card space-y-3">
          <div className="flex justify-between items-start">
            <p className="text-sm text-muted-foreground">Préstamos Activos (USD)</p>
            <Badge variant="outline" className="text-xs">{activeLoansUSD.length} préstamos</Badge>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Adeudado</p>
              <p className="text-lg font-bold font-mono">{formatCurrency(totalDueUSD, 'USD')}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pagado</p>
              <p className="text-lg font-bold font-mono text-success">{formatCurrency(totalPaidUSD, 'USD')}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pendiente</p>
            <p className="text-xl font-bold font-mono text-warning">{formatCurrency(remainingDueUSD, 'USD')}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch id="show-paid" checked={showPaid} onCheckedChange={setShowPaid} />
        <Label htmlFor="show-paid" className="text-sm cursor-pointer">Mostrar préstamos pagados</Label>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredLoans.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-card rounded-lg border">
            No se encontraron préstamos
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
                      {format(parseLocalDate(loan.loan_date), 'd MMM yyyy', { locale: es })}
                      {' • '}{ACCOUNT_LABELS[loan.account]}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(loan.status)}
                    {isAdmin ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-10 w-10 press"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover">
                          {loan.status === 'active' && (
                            <>
                              <DropdownMenuItem onClick={() => setEditingLoan(loan)}>
                                <Pencil className="mr-2 h-4 w-4" />Editar Préstamo
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setAddingPaymentLoan(loan)}>
                                <DollarSign className="mr-2 h-4 w-4" />Agregar Pago
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setViewingHistoryLoan(loan)}>
                                <History className="mr-2 h-4 w-4" />Ver Historial
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setMarkingPaidLoan(loan)}>
                                <CheckCircle className="mr-2 h-4 w-4" />Marcar como Pagado
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => cancelLoan.mutate(loan.id)} className="text-warning focus:text-warning">
                                <XCircle className="mr-2 h-4 w-4" />Cancelar Préstamo
                              </DropdownMenuItem>
                            </>
                          )}
                          {loan.status === 'paid' && (
                            <>
                              <DropdownMenuItem onClick={() => setViewingHistoryLoan(loan)}>
                                <History className="mr-2 h-4 w-4" />Ver Historial
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setRevertingLoan(loan)}>
                                <Undo2 className="mr-2 h-4 w-4" />Revertir a Activo
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem onClick={() => setDeletingLoan(loan)} className="text-destructive focus:text-destructive">
                            <Trash2 className="mr-2 h-4 w-4" />Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-10 w-10 press" onClick={() => setViewingHistoryLoan(loan)}>
                        <History className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {loan.status === 'active' && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Pagado: {formatCurrency(loan.amount_paid, currency)}</span>
                      <span className="font-medium">{paidPercentage.toFixed(0)}%</span>
                    </div>
                    <Progress value={paidPercentage} className="h-1.5" />
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border/50 pt-3">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">{loan.status === 'active' ? 'Pendiente' : 'Total'}</p>
                    <span className={cn("font-mono text-lg font-semibold", loan.status === 'active' && remainingDue > 0 && "text-warning")}>
                      {formatCurrency(loan.status === 'active' ? remainingDue : loan.amount, currency)}
                    </span>
                  </div>
                  {loan.paid_date && (
                    <span className="text-xs text-muted-foreground">
                      Pagado: {format(parseLocalDate(loan.paid_date), 'd MMM yyyy', { locale: es })}
                    </span>
                  )}
                </div>
                {loan.notes && <p className="text-sm text-muted-foreground truncate">{loan.notes}</p>}
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
              <TableHead>
                <button onClick={() => handleSort('date')} className="press flex items-center hover:text-foreground">
                  Fecha {getSortIcon('date')}
                </button>
              </TableHead>
              <TableHead>
                <button onClick={() => handleSort('member')} className="press flex items-center hover:text-foreground">
                  Miembro {getSortIcon('member')}
                </button>
              </TableHead>
              <TableHead>Cuenta</TableHead>
              <TableHead>
                <button onClick={() => handleSort('total')} className="press flex items-center hover:text-foreground">
                  Total {getSortIcon('total')}
                </button>
              </TableHead>
              <TableHead>Pagado</TableHead>
              <TableHead>
                <button onClick={() => handleSort('remaining')} className="press flex items-center hover:text-foreground">
                  Pendiente {getSortIcon('remaining')}
                </button>
              </TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLoans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No se encontraron préstamos
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
                      {format(parseLocalDate(loan.loan_date), 'd MMM yyyy', { locale: es })}
                    </TableCell>
                    <TableCell>{loan.member?.full_name}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{ACCOUNT_LABELS[loan.account]}</span>
                    </TableCell>
                    <TableCell className="font-mono">{formatCurrency(loan.amount, currency)}</TableCell>
                    <TableCell className="font-mono text-success">
                      {formatCurrency(loan.amount_paid, currency)}
                      {loan.status === 'active' && (
                        <span className="text-xs text-muted-foreground ml-1">({paidPercentage.toFixed(0)}%)</span>
                      )}
                    </TableCell>
                    <TableCell className={cn("font-mono font-semibold", loan.status === 'active' && remainingDue > 0 && "text-warning")}>
                      {formatCurrency(remainingDue, currency)}
                    </TableCell>
                    <TableCell>{getStatusBadge(loan.status)}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-muted-foreground">{loan.notes || '—'}</TableCell>
                    {isAdmin ? (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Abrir menú</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            {loan.status === 'active' && (
                              <>
                                <DropdownMenuItem onClick={() => setEditingLoan(loan)}>
                                  <Pencil className="mr-2 h-4 w-4" />Editar Préstamo
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setAddingPaymentLoan(loan)}>
                                  <DollarSign className="mr-2 h-4 w-4" />Agregar Pago
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setViewingHistoryLoan(loan)}>
                                  <History className="mr-2 h-4 w-4" />Ver Historial
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setMarkingPaidLoan(loan)}>
                                  <CheckCircle className="mr-2 h-4 w-4" />Marcar como Pagado
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => cancelLoan.mutate(loan.id)} className="text-warning focus:text-warning">
                                  <XCircle className="mr-2 h-4 w-4" />Cancelar Préstamo
                                </DropdownMenuItem>
                              </>
                            )}
                            {loan.status === 'paid' && (
                              <>
                                <DropdownMenuItem onClick={() => setViewingHistoryLoan(loan)}>
                                  <History className="mr-2 h-4 w-4" />Ver Historial
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setRevertingLoan(loan)}>
                                  <Undo2 className="mr-2 h-4 w-4" />Revertir a Activo
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem onClick={() => setDeletingLoan(loan)} className="text-destructive focus:text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />Eliminar
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

      <AddLoanDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
      {markingPaidLoan && <MarkPaidDialog loan={markingPaidLoan} open={!!markingPaidLoan} onOpenChange={(open) => !open && setMarkingPaidLoan(null)} />}
      {deletingLoan && <DeleteLoanDialog loan={deletingLoan} open={!!deletingLoan} onOpenChange={(open) => !open && setDeletingLoan(null)} />}
      {addingPaymentLoan && <AddPaymentDialog loan={addingPaymentLoan} open={!!addingPaymentLoan} onOpenChange={(open) => !open && setAddingPaymentLoan(null)} />}
      {viewingHistoryLoan && <PaymentHistoryDialog loan={viewingHistoryLoan} open={!!viewingHistoryLoan} onOpenChange={(open) => !open && setViewingHistoryLoan(null)} />}
      {revertingLoan && <RevertPaidDialog loan={revertingLoan} open={!!revertingLoan} onOpenChange={(open) => !open && setRevertingLoan(null)} />}
      {editingLoan && <EditLoanDialog loan={editingLoan} open={!!editingLoan} onOpenChange={(open) => !open && setEditingLoan(null)} />}
    </div>
  );
}
