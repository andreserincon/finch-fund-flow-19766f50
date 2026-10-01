import { useState } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { EditTransactionDialog } from '@/components/forms/EditTransactionDialog';
import { DeleteTransactionDialog } from '@/components/forms/DeleteTransactionDialog';
import { EditTransferDialog } from '@/components/forms/EditTransferDialog';
import { DeleteTransferDialog } from '@/components/forms/DeleteTransferDialog';
import { useAccountTransfers } from '@/hooks/useAccountTransfers';
import { transferInAmount, transferOutAmount } from '@/lib/transfers';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Search, TrendingUp, TrendingDown, MoreHorizontal, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, ArrowLeftRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn, formatCurrency, getCurrencyForAccount, parseLocalDate } from '@/lib/utils';
import { CATEGORY_LABELS, ACCOUNT_LABELS, Transaction, AccountType, AccountTransfer } from '@/lib/types';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '@/components/ui/loading';
import { AddTransactionForm } from '@/components/forms/AddTransactionForm';

/**
 * One line of the movements list. A transfer between accounts is shown as two
 * lines — the egreso from the origin account (in its currency) and the ingreso
 * into the destination account — so each account's history reads complete.
 */
type MovementRow =
  | { kind: 'transaction'; key: string; date: string; account: AccountType; amount: number; isIncome: boolean; label: string; transaction: Transaction }
  | { kind: 'transfer'; key: string; date: string; account: AccountType; amount: number; isIncome: boolean; label: string; transfer: AccountTransfer; counterpart: AccountType };

const TRANSFER_LABEL = 'Transferencia';

export default function Transactions() {
  const { t } = useTranslation();
  const { transactions, isLoading: transactionsLoading } = useTransactions();
  const { transfers, isLoading: transfersLoading } = useAccountTransfers();
  const isLoading = transactionsLoading || transfersLoading;
  const { isAdmin } = useIsAdmin();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<AccountTransfer | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState<AccountTransfer | null>(null);

  // Sort state. Default: most recent first (matches the backend order).
  type SortColumn = 'date' | 'category' | 'amount';
  const [sortConfig, setSortConfig] = useState<{ column: SortColumn; direction: 'asc' | 'desc' }>({
    column: 'date',
    direction: 'desc',
  });
  const handleSort = (column: SortColumn) => {
    setSortConfig((prev) => ({ column, direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };
  const getSortIcon = (column: SortColumn) => {
    if (sortConfig.column !== column) return <ArrowUpDown className="ml-1 h-4 w-4" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-1 h-4 w-4" /> : <ArrowDown className="ml-1 h-4 w-4" />;
  };

  const formatTransactionCurrency = (amount: number, account: AccountType) => {
    return formatCurrency(amount, getCurrencyForAccount(account));
  };

  // Build unique month options from transactions
  const monthOptions = Array.from(
    new Set(
      [
        ...transactions.map((t) => t.transaction_date.substring(0, 7)), // "YYYY-MM"
        ...transfers.map((tr) => tr.transfer_date.substring(0, 7)),
      ]
    )
  ).sort((a, b) => b.localeCompare(a));

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch =
      (transaction.notes?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (transaction.member?.full_name.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      CATEGORY_LABELS[transaction.category].toLowerCase().includes(search.toLowerCase());

    const matchesType =
      typeFilter === 'all' || transaction.transaction_type === typeFilter;

    const matchesCategory =
      categoryFilter === 'all' || transaction.category === categoryFilter;

    const matchesAccount =
      accountFilter === 'all' || transaction.account === accountFilter;

    const matchesMonth =
      monthFilter === 'all' || transaction.transaction_date.startsWith(monthFilter);

    return matchesSearch && matchesType && matchesCategory && matchesAccount && matchesMonth;
  });

  // Transfers are neither income nor expense nor a category, so they only show
  // under "Todos los Tipos"/"Transferencia" with no category filter applied.
  const transferRows: MovementRow[] = transfers.flatMap((transfer): MovementRow[] => [
    {
      kind: 'transfer', key: `${transfer.id}-out`, date: transfer.transfer_date,
      account: transfer.from_account, amount: transferOutAmount(transfer), isIncome: false,
      label: TRANSFER_LABEL, transfer, counterpart: transfer.to_account,
    },
    {
      kind: 'transfer', key: `${transfer.id}-in`, date: transfer.transfer_date,
      account: transfer.to_account, amount: transferInAmount(transfer), isIncome: true,
      label: TRANSFER_LABEL, transfer, counterpart: transfer.from_account,
    },
  ]).filter((row) => {
    if (row.kind !== 'transfer') return false;
    const q = search.toLowerCase();
    const matchesSearch =
      TRANSFER_LABEL.toLowerCase().includes(q) ||
      (row.transfer.notes?.toLowerCase().includes(q) ?? false) ||
      ACCOUNT_LABELS[row.counterpart].toLowerCase().includes(q);
    const matchesType = typeFilter === 'all' || typeFilter === 'transfer';
    const matchesCategory = categoryFilter === 'all';
    const matchesAccount = accountFilter === 'all' || row.account === accountFilter;
    const matchesMonth = monthFilter === 'all' || row.date.startsWith(monthFilter);
    return matchesSearch && matchesType && matchesCategory && matchesAccount && matchesMonth;
  });

  const transactionRows: MovementRow[] = filteredTransactions.map((transaction) => ({
    kind: 'transaction', key: transaction.id, date: transaction.transaction_date,
    account: transaction.account, amount: transaction.amount,
    isIncome: transaction.transaction_type === 'income',
    label: CATEGORY_LABELS[transaction.category], transaction,
  }));

  const sortedRows = [...transactionRows, ...transferRows].sort((a, b) => {
    const direction = sortConfig.direction === 'asc' ? 1 : -1;
    switch (sortConfig.column) {
      case 'date': return direction * (parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime());
      case 'category': return direction * a.label.localeCompare(b.label);
      case 'amount': return direction * (a.amount - b.amount);
      default: return 0;
    }
  });

  const handleEdit = (row: MovementRow) =>
    row.kind === 'transfer' ? setEditingTransfer(row.transfer) : setEditingTransaction(row.transaction);
  const handleDelete = (row: MovementRow) =>
    row.kind === 'transfer' ? setDeletingTransfer(row.transfer) : setDeletingTransaction(row.transaction);

  const badgeClass = (row: MovementRow) =>
    row.kind === 'transfer'
      ? 'bg-muted text-foreground hover:bg-muted'
      : row.isIncome
        ? 'bg-success/10 text-success hover:bg-success/20'
        : 'bg-overdue/10 text-overdue hover:bg-overdue/20';

  const transferDetail = (row: MovementRow) =>
    row.kind === 'transfer'
      ? `${row.isIncome ? 'Desde' : 'Hacia'} ${ACCOUNT_LABELS[row.counterpart]}`
      : null;

  const arsTransactions = filteredTransactions.filter(t => t.account !== 'savings');
  const usdTransactions = filteredTransactions.filter(t => t.account === 'savings');

  const totalIncomeARS = arsTransactions
    .filter((t) => t.transaction_type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpensesARS = arsTransactions
    .filter((t) => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalIncomeUSD = usdTransactions
    .filter((t) => t.transaction_type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpensesUSD = usdTransactions
    .filter((t) => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <Skeleton className="h-7 w-44" />
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
        <TableSkeleton rows={8} cols={6} />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground font-display">Transacciones</h1>
          <p className="text-sm text-muted-foreground">
            {transactions.length} transacciones · {transfers.length} transferencias
          </p>
        </div>
        {isAdmin && <AddTransactionForm triggerLabel={t('dashboard.logTransaction')} />}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="stat-card flex items-center gap-3">
          <div className="p-2 md:p-3 rounded-lg bg-success/10">
            <TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-success" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm text-muted-foreground">Ingresos (ARS)</p>
            <p className="text-base md:text-xl font-bold amount-positive tabular-nums leading-tight break-words">
              {formatCurrency(totalIncomeARS, 'ARS')}
            </p>
          </div>
        </div>
        <div className="stat-card flex items-center gap-3">
          <div className="p-2 md:p-3 rounded-lg bg-overdue/10">
            <TrendingDown className="h-5 w-5 md:h-6 md:w-6 text-overdue" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm text-muted-foreground">Gastos (ARS)</p>
            <p className="text-base md:text-xl font-bold amount-negative tabular-nums leading-tight break-words">
              {formatCurrency(totalExpensesARS, 'ARS')}
            </p>
          </div>
        </div>
        {(totalIncomeUSD > 0 || totalExpensesUSD > 0) && (
          <>
            <div className="stat-card flex items-center gap-3">
              <div className="p-2 md:p-3 rounded-lg bg-success/10">
                <TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-success" />
              </div>
              <div className="min-w-0">
                <p className="text-xs md:text-sm text-muted-foreground">Ingresos (USD)</p>
                <p className="text-base md:text-xl font-bold amount-positive tabular-nums leading-tight break-words">
                  {formatCurrency(totalIncomeUSD, 'USD')}
                </p>
              </div>
            </div>
            <div className="stat-card flex items-center gap-3">
              <div className="p-2 md:p-3 rounded-lg bg-overdue/10">
                <TrendingDown className="h-5 w-5 md:h-6 md:w-6 text-overdue" />
              </div>
              <div className="min-w-0">
                <p className="text-xs md:text-sm text-muted-foreground">Gastos (USD)</p>
                <p className="text-base md:text-xl font-bold amount-negative tabular-nums leading-tight break-words">
                  {formatCurrency(totalExpensesUSD, 'USD')}
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar transacciones..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los Tipos</SelectItem>
              <SelectItem value="income">Ingreso</SelectItem>
              <SelectItem value="expense">Gasto</SelectItem>
              <SelectItem value="transfer">{TRANSFER_LABEL}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las Categorías</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder="Cuenta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las Cuentas</SelectItem>
              {Object.entries(ACCOUNT_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder="Mes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los Meses</SelectItem>
              {monthOptions.map((ym) => {
                const d = parseLocalDate(`${ym}-01`);
                return (
                  <SelectItem key={ym} value={ym}>
                    {format(d, 'MMMM yyyy', { locale: es })}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {sortedRows.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-card rounded-lg border">
            No se encontraron transacciones
          </div>
        ) : (
          sortedRows.map((row) => (
            <div key={row.key} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <Badge variant="outline" className={cn('border-transparent', badgeClass(row))}>
                    {row.kind === 'transfer' && <ArrowLeftRight className="mr-1 h-3 w-3" />}
                    {row.label}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {format(parseLocalDate(row.date), 'd MMM yyyy', { locale: es })}
                    {' • '}{ACCOUNT_LABELS[row.account] || 'Cuenta Bancaria Principal'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'font-mono font-semibold text-lg',
                      row.isIncome ? 'amount-positive' : 'amount-negative'
                    )}
                  >
                    {row.isIncome ? '+' : '-'}
                    {formatTransactionCurrency(row.amount, row.account)}
                  </span>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-popover">
                        <DropdownMenuItem onClick={() => handleEdit(row)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDelete(row)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
              {row.kind === 'transfer' ? (
                <div className="text-sm text-muted-foreground border-t border-border/50 pt-3">
                  <p>{transferDetail(row)}</p>
                  {row.transfer.notes && <p className="truncate">Nota: {row.transfer.notes}</p>}
                </div>
              ) : (row.transaction.member?.full_name || row.transaction.notes) && (
                <div className="text-sm text-muted-foreground border-t border-border/50 pt-3">
                  {row.transaction.member?.full_name && <p>Miembro: {row.transaction.member.full_name}</p>}
                  {row.transaction.notes && <p className="truncate">Nota: {row.transaction.notes}</p>}
                </div>
              )}
            </div>
          ))
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
              <TableHead>Cuenta</TableHead>
              <TableHead>
                <button onClick={() => handleSort('category')} className="press flex items-center hover:text-foreground">
                  Categoría {getSortIcon('category')}
                </button>
              </TableHead>
              <TableHead>Miembro / Detalle</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="text-right">
                <button onClick={() => handleSort('amount')} className="press ml-auto flex items-center hover:text-foreground">
                  Monto {getSortIcon('amount')}
                </button>
              </TableHead>
              {isAdmin && <TableHead className="w-[50px]"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No se encontraron transacciones
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-medium">
                    {format(parseLocalDate(row.date), 'd MMM yyyy', { locale: es })}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {ACCOUNT_LABELS[row.account] || 'Cuenta Bancaria Principal'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('border-transparent', badgeClass(row))}>
                      {row.kind === 'transfer' && <ArrowLeftRight className="mr-1 h-3 w-3" />}
                      {row.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {row.kind === 'transfer' ? (
                      <span className="text-muted-foreground">{transferDetail(row)}</span>
                    ) : row.transaction.member?.full_name || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {(row.kind === 'transfer' ? row.transfer.notes : row.transaction.notes) || '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span
                      className={cn(
                        'font-semibold',
                        row.isIncome ? 'amount-positive' : 'amount-negative'
                      )}
                    >
                      {row.isIncome ? '+' : '-'}
                      {formatTransactionCurrency(row.amount, row.account)}
                    </span>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Abrir menú</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover">
                          <DropdownMenuItem onClick={() => handleEdit(row)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(row)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editingTransaction && (
        <EditTransactionDialog
          transaction={editingTransaction}
          open={!!editingTransaction}
          onOpenChange={(open) => !open && setEditingTransaction(null)}
        />
      )}

      {editingTransfer && (
        <EditTransferDialog
          transfer={editingTransfer}
          open={!!editingTransfer}
          onOpenChange={(open) => !open && setEditingTransfer(null)}
        />
      )}

      {deletingTransfer && (
        <DeleteTransferDialog
          transfer={deletingTransfer}
          open={!!deletingTransfer}
          onOpenChange={(open) => !open && setDeletingTransfer(null)}
        />
      )}

      {deletingTransaction && (
        <DeleteTransactionDialog
          transaction={deletingTransaction}
          open={!!deletingTransaction}
          onOpenChange={(open) => !open && setDeletingTransaction(null)}
        />
      )}
    </div>
  );
}
