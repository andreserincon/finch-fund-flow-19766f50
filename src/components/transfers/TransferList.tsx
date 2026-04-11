import { useState } from 'react';
import { useAccountTransfers } from '@/hooks/useAccountTransfers';
import { EditTransferDialog } from '@/components/forms/EditTransferDialog';
import { DeleteTransferDialog } from '@/components/forms/DeleteTransferDialog';
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
import { MoreHorizontal, Pencil, Trash2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { AccountTransfer, ACCOUNT_LABELS } from '@/lib/types';
import { formatCurrency, getCurrencyForAccount, parseLocalDate } from '@/lib/utils';

export function TransferList() {
  const { transfers, isLoading } = useAccountTransfers();
  const [editingTransfer, setEditingTransfer] = useState<AccountTransfer | null>(null);
  const [deletingTransfer, setDeletingTransfer] = useState<AccountTransfer | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-pulse text-muted-foreground">Cargando transferencias...</div>
      </div>
    );
  }

  if (transfers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground bg-card rounded-lg border">
        No hay transferencias registradas
      </div>
    );
  }

  return (
    <>
      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {transfers.map((transfer) => {
          const currency = getCurrencyForAccount(transfer.to_account);
          return (
            <div key={transfer.id} className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Badge variant="outline">{ACCOUNT_LABELS[transfer.from_account]}</Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <Badge variant="outline">{ACCOUNT_LABELS[transfer.to_account]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {format(parseLocalDate(transfer.transfer_date), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-lg">
                    {formatCurrency(transfer.amount, currency)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover">
                      <DropdownMenuItem onClick={() => setEditingTransfer(transfer)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => setDeletingTransfer(transfer)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {transfer.notes && (
                <p className="text-sm text-muted-foreground truncate">
                  {transfer.notes}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.map((transfer) => {
              const currency = getCurrencyForAccount(transfer.to_account);
              return (
                <TableRow key={transfer.id}>
                  <TableCell className="font-medium">
                    {format(parseLocalDate(transfer.transfer_date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{ACCOUNT_LABELS[transfer.from_account]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{ACCOUNT_LABELS[transfer.to_account]}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-muted-foreground">
                    {transfer.notes || '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {formatCurrency(transfer.amount, currency)}
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
                        <DropdownMenuItem onClick={() => setEditingTransfer(transfer)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setDeletingTransfer(transfer)}
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
            })}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      {editingTransfer && (
        <EditTransferDialog
          transfer={editingTransfer}
          open={!!editingTransfer}
          onOpenChange={(open) => !open && setEditingTransfer(null)}
        />
      )}

      {/* Delete Dialog */}
      {deletingTransfer && (
        <DeleteTransferDialog
          transfer={deletingTransfer}
          open={!!deletingTransfer}
          onOpenChange={(open) => !open && setDeletingTransfer(null)}
        />
      )}
    </>
  );
}
