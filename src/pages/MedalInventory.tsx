import { useState } from 'react';
import { useMedalInventory } from '@/hooks/useMedalInventory';
import { useMembers } from '@/hooks/useMembers';
import { AddStockDialog } from '@/components/medallas/AddStockDialog';
import { DeliverMedalDialog } from '@/components/medallas/DeliverMedalDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Medal, PackagePlus, Gift } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseLocalDate } from '@/lib/utils';
import { MEDAL_REASON_LABELS } from '@/lib/medallas-types';

export default function MedalInventory() {
  const { stock, movements, isLoading, addStock, deliver } = useMedalInventory();
  const { memberBalances } = useMembers();

  const activeMembers = memberBalances
    .filter((m) => m.is_active)
    .map((m) => ({ member_id: m.member_id, full_name: m.full_name }));

  const [addOpen, setAddOpen] = useState(false);
  const [deliverOpen, setDeliverOpen] = useState(false);

  const fmtDate = (d: string) => format(parseLocalDate(d), 'd MMM yyyy', { locale: es });

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <Medal className="h-6 w-6 text-primary" />Inventario de medallas
          </h1>
          <p className="text-sm text-muted-foreground">Stock y movimientos de medallas.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setAddOpen(true)}>
            <PackagePlus className="h-4 w-4 mr-2" />Entrada
          </Button>
          <Button onClick={() => setDeliverOpen(true)}>
            <Gift className="h-4 w-4 mr-2" />Entregar
          </Button>
        </div>
      </div>

      <div className="stat-card">
        <p className="text-xs text-muted-foreground">Medallas en stock</p>
        <p className="text-3xl font-bold mt-1">{isLoading ? '...' : stock}</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Movimientos</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : movements.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground bg-card rounded-lg border">
            Todavía no hay movimientos. Registrá una entrada para cargar stock.
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {movements.map((m) => (
                <div key={m.id} className="rounded-lg border bg-card p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={m.movement_type === 'in' ? 'outline' : 'secondary'}
                        className={m.movement_type === 'in' ? 'border-success/40 text-success' : ''}>
                        {m.movement_type === 'in' ? 'Entrada' : 'Salida'}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{MEDAL_REASON_LABELS[m.reason]}</span>
                    </div>
                    <p className="text-sm mt-1 truncate">
                      {m.member?.full_name ?? ''}{m.note ? (m.member?.full_name ? ` · ${m.note}` : m.note) : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">{fmtDate(m.movement_date)}</p>
                  </div>
                  <span className={`text-lg font-bold ${m.movement_type === 'in' ? 'text-success' : 'text-foreground'}`}>
                    {m.movement_type === 'in' ? '+' : '-'}{m.quantity}
                  </span>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Hermano</TableHead>
                    <TableHead>Nota</TableHead>
                    <TableHead>Fecha</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Badge variant={m.movement_type === 'in' ? 'outline' : 'secondary'}
                          className={m.movement_type === 'in' ? 'border-success/40 text-success' : ''}>
                          {m.movement_type === 'in' ? 'Entrada' : 'Salida'}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-mono ${m.movement_type === 'in' ? 'text-success' : ''}`}>
                        {m.movement_type === 'in' ? '+' : '-'}{m.quantity}
                      </TableCell>
                      <TableCell>{MEDAL_REASON_LABELS[m.reason]}</TableCell>
                      <TableCell>{m.member?.full_name ?? <span className="text-muted-foreground">-</span>}</TableCell>
                      <TableCell className="text-muted-foreground">{m.note ?? '-'}</TableCell>
                      <TableCell className="text-muted-foreground">{fmtDate(m.movement_date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      <AddStockDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        isPending={addStock.isPending}
        onAdd={(input) => addStock.mutate(input, { onSuccess: () => setAddOpen(false) })}
      />
      <DeliverMedalDialog
        open={deliverOpen}
        onOpenChange={setDeliverOpen}
        members={activeMembers}
        isPending={deliver.isPending}
        onDeliver={(input) => deliver.mutate(input, { onSuccess: () => setDeliverOpen(false) })}
      />
    </div>
  );
}
