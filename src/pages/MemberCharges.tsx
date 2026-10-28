import { useState } from 'react';
import { useMemberCharges } from '@/hooks/useMemberCharges';
import { useMembers } from '@/hooks/useMembers';
import { AddChargeDialog } from '@/components/cobros/AddChargeDialog';
import { RegisterPaymentDialog } from '@/components/cobros/RegisterPaymentDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MoreHorizontal, Plus, DollarSign, Ban } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrency, parseLocalDate, cn } from '@/lib/utils';
import {
  CHARGE_CATEGORY_LABELS, CHARGE_STATUS_LABELS, chargeBalance, type MemberCharge,
} from '@/lib/cobros-types';

function StatusBadge({ status }: { status: MemberCharge['status'] }) {
  const label = CHARGE_STATUS_LABELS[status];
  if (status === 'paid') return <Badge variant="outline" className="border-success/40 text-success">{label}</Badge>;
  if (status === 'partial') return <Badge variant="outline" className="border-primary/40 text-primary">{label}</Badge>;
  if (status === 'cancelled') return <Badge variant="outline" className="text-muted-foreground">{label}</Badge>;
  return <Badge variant="secondary">{label}</Badge>;
}

export default function MemberCharges() {
  const { charges, isLoading, createCharge, registerPayment, cancelCharge } = useMemberCharges();
  const { memberBalances } = useMembers();

  const activeMembers = memberBalances
    .filter((m) => m.is_active)
    .map((m) => ({ member_id: m.member_id, full_name: m.full_name }));

  const [addOpen, setAddOpen] = useState(false);
  const [payCharge, setPayCharge] = useState<MemberCharge | null>(null);
  const [cancelTarget, setCancelTarget] = useState<MemberCharge | null>(null);
  const [filter, setFilter] = useState<'pendientes' | 'pagados' | 'todos'>('pendientes');

  const open = charges.filter((c) => c.status === 'pending' || c.status === 'partial');
  const totalArs = open.filter((c) => c.currency === 'ARS').reduce((s, c) => s + chargeBalance(c), 0);
  const totalUsd = open.filter((c) => c.currency === 'USD').reduce((s, c) => s + chargeBalance(c), 0);

  const FILTERS = [
    { key: 'pendientes', label: 'Pendientes' },
    { key: 'pagados', label: 'Pagados' },
    { key: 'todos', label: 'Todos' },
  ] as const;
  const visible = charges.filter((c) => {
    if (filter === 'pendientes') return c.status === 'pending' || c.status === 'partial';
    if (filter === 'pagados') return c.status === 'paid';
    return true;
  });

  const fmtDate = (d: string) => format(parseLocalDate(d), 'd MMM yyyy', { locale: es });

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Cobros pendientes</h1>
          <p className="text-sm text-muted-foreground">
            Cargos puntuales a cobrar (medallas, rituales, derechos).
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />Nuevo cargo
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">Pendiente en pesos</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalArs, 'ARS')}</p>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">Pendiente en dólares</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalUsd, 'USD')}</p>
        </div>
      </div>

      <div className="inline-flex gap-1 rounded-lg bg-muted p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'press rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
              filter === f.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground bg-card rounded-lg border">
          {charges.length === 0
            ? 'Todavía no hay cobros. Usá "Nuevo cargo" para registrar el primero.'
            : 'No hay cobros para mostrar con este filtro.'}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {visible.map((c) => (
              <div key={c.id} className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.member?.full_name ?? 'Hermano'}</p>
                    <p className="text-xs text-muted-foreground">
                      {CHARGE_CATEGORY_LABELS[c.category]}{c.note ? ` · ${c.note}` : ''}
                    </p>
                  </div>
                  <ChargeActions charge={c} onPay={() => setPayCharge(c)} onCancel={() => setCancelTarget(c)} />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <StatusBadge status={c.status} />
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(chargeBalance(c), c.currency)}</p>
                    <p className="text-xs text-muted-foreground">
                      de {formatCurrency(Number(c.amount), c.currency)} · {fmtDate(c.charge_date)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hermano</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.member?.full_name ?? '-'}</TableCell>
                    <TableCell>
                      {CHARGE_CATEGORY_LABELS[c.category]}
                      {c.note ? <span className="text-muted-foreground"> · {c.note}</span> : null}
                    </TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(c.amount), c.currency)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(chargeBalance(c), c.currency)}</TableCell>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(c.charge_date)}</TableCell>
                    <TableCell>
                      <ChargeActions charge={c} onPay={() => setPayCharge(c)} onCancel={() => setCancelTarget(c)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <AddChargeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        members={activeMembers}
        isPending={createCharge.isPending}
        onCreate={(input) => createCharge.mutate(input, { onSuccess: () => setAddOpen(false) })}
      />
      <RegisterPaymentDialog
        charge={payCharge}
        onOpenChange={(o) => !o && setPayCharge(null)}
        isPending={registerPayment.isPending}
        onPay={(input) => registerPayment.mutate(input, { onSuccess: () => setPayCharge(null) })}
      />
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anular cargo</AlertDialogTitle>
            <AlertDialogDescription>
              El cargo queda anulado y deja de contar como pendiente. Los cobros ya registrados no se tocan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (cancelTarget) cancelCharge.mutate(cancelTarget.id);
                setCancelTarget(null);
              }}
            >
              Anular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ChargeActions({ charge, onPay, onCancel }: { charge: MemberCharge; onPay: () => void; onCancel: () => void }) {
  const canAct = charge.status === 'pending' || charge.status === 'partial';
  if (!canAct) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover">
        <DropdownMenuItem onClick={onPay}><DollarSign className="mr-2 h-4 w-4" />Registrar cobro</DropdownMenuItem>
        <DropdownMenuItem onClick={onCancel} className="text-destructive focus:text-destructive">
          <Ban className="mr-2 h-4 w-4" />Anular
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
