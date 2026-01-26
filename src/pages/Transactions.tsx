import { useState } from 'react';
import { useTransactions } from '@/hooks/useTransactions';
import { EditTransactionDialog } from '@/components/forms/EditTransactionDialog';
import { DeleteTransactionDialog } from '@/components/forms/DeleteTransactionDialog';
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
import { Search, TrendingUp, TrendingDown, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS, Transaction } from '@/lib/types';

export default function Transactions() {
  const { transactions, isLoading } = useTransactions();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
    }).format(amount);
  };

  const filteredTransactions = transactions.filter((transaction) => {
    const matchesSearch =
      (transaction.notes?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (transaction.member?.full_name.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      CATEGORY_LABELS[transaction.category].toLowerCase().includes(search.toLowerCase());

    const matchesType =
      typeFilter === 'all' || transaction.transaction_type === typeFilter;

    const matchesCategory =
      categoryFilter === 'all' || transaction.category === categoryFilter;

    return matchesSearch && matchesType && matchesCategory;
  });

  const totalIncome = filteredTransactions
    .filter((t) => t.transaction_type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = filteredTransactions
    .filter((t) => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);

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
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-foreground">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          {transactions.length} total transactions
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2">
        <div className="stat-card flex items-center gap-3">
          <div className="p-2 md:p-3 rounded-lg bg-success/10">
            <TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-success" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm text-muted-foreground">Total Income</p>
            <p className="text-lg md:text-2xl font-bold amount-positive truncate">
              {formatCurrency(totalIncome)}
            </p>
          </div>
        </div>
        <div className="stat-card flex items-center gap-3">
          <div className="p-2 md:p-3 rounded-lg bg-overdue/10">
            <TrendingDown className="h-5 w-5 md:h-6 md:w-6 text-overdue" />
          </div>
          <div className="min-w-0">
            <p className="text-xs md:text-sm text-muted-foreground">Total Expenses</p>
            <p className="text-lg md:text-2xl font-bold amount-negative truncate">
              {formatCurrency(totalExpenses)}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="flex-1 sm:w-[140px] sm:flex-none">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="expense">Expense</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="flex-1 sm:w-[180px] sm:flex-none">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground bg-card rounded-lg border">
            No transactions found
          </div>
        ) : (
          filteredTransactions.map((transaction) => (
            <div key={transaction.id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <Badge
                    variant={transaction.transaction_type === 'income' ? 'default' : 'destructive'}
                    className={cn(
                      transaction.transaction_type === 'income'
                        ? 'bg-success/10 text-success hover:bg-success/20'
                        : 'bg-overdue/10 text-overdue hover:bg-overdue/20'
                    )}
                  >
                    {CATEGORY_LABELS[transaction.category]}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(transaction.transaction_date), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'font-mono font-semibold text-lg',
                      transaction.transaction_type === 'income' ? 'amount-positive' : 'amount-negative'
                    )}
                  >
                    {transaction.transaction_type === 'income' ? '+' : '-'}
                    {formatCurrency(transaction.amount)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover">
                      <DropdownMenuItem onClick={() => setEditingTransaction(transaction)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => setDeletingTransaction(transaction)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {(transaction.member?.full_name || transaction.notes) && (
                <div className="text-sm text-muted-foreground">
                  {transaction.member?.full_name && <p>Member: {transaction.member.full_name}</p>}
                  {transaction.notes && <p className="truncate">Note: {transaction.notes}</p>}
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
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTransactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No transactions found
                </TableCell>
              </TableRow>
            ) : (
              filteredTransactions.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="font-medium">
                    {format(new Date(transaction.transaction_date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        transaction.transaction_type === 'income'
                          ? 'default'
                          : 'destructive'
                      }
                      className={cn(
                        transaction.transaction_type === 'income'
                          ? 'bg-success/10 text-success hover:bg-success/20'
                          : 'bg-overdue/10 text-overdue hover:bg-overdue/20'
                      )}
                    >
                      {CATEGORY_LABELS[transaction.category]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {transaction.member?.full_name || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {transaction.notes || '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <span
                      className={cn(
                        'font-semibold',
                        transaction.transaction_type === 'income'
                          ? 'amount-positive'
                          : 'amount-negative'
                      )}
                    >
                      {transaction.transaction_type === 'income' ? '+' : '-'}
                      {formatCurrency(transaction.amount)}
                    </span>
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
                        <DropdownMenuItem onClick={() => setEditingTransaction(transaction)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setDeletingTransaction(transaction)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      {editingTransaction && (
        <EditTransactionDialog
          transaction={editingTransaction}
          open={!!editingTransaction}
          onOpenChange={(open) => !open && setEditingTransaction(null)}
        />
      )}

      {/* Delete Dialog */}
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
