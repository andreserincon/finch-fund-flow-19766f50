/**
 * @file EventOverview.tsx
 * @description Per-event summary page at /events/:id. Shows projected
 *   vs. paid income from participants, real income/expense from tagged
 *   transactions, and the participant list (members + guests) with
 *   inline payment edits. Treasurers can add non-member guests here.
 */

import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, PlusCircle, UserPlus, Trash2, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useEventOverview } from '@/hooks/useEventOverview';
import { useEventMemberPayments } from '@/hooks/useEventMemberPayments';
import { useMembers } from '@/hooks/useMembers';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { formatCurrency, parseLocalDate } from '@/lib/utils';
import { CATEGORY_LABELS, EventMemberPayment } from '@/lib/types';

const guestSchema = z.object({
  guest_name: z.string().min(1, 'El nombre es obligatorio').max(100),
  guest_phone: z.string().max(40).optional(),
  amount_owed: z.number().min(0, 'El monto debe ser positivo'),
});
type GuestFormData = z.infer<typeof guestSchema>;

function AddGuestDialog({ eventId, defaultAmount }: { eventId: string; defaultAmount: number }) {
  const [open, setOpen] = useState(false);
  const { addGuestToEvent } = useEventMemberPayments(eventId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GuestFormData>({
    resolver: zodResolver(guestSchema),
    defaultValues: { amount_owed: defaultAmount },
  });

  const onSubmit = async (data: GuestFormData) => {
    await addGuestToEvent.mutateAsync({
      eventId,
      guestName: data.guest_name,
      guestPhone: data.guest_phone || null,
      amountOwed: data.amount_owed,
    });
    reset({ amount_owed: defaultAmount });
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset({ amount_owed: defaultAmount });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus className="mr-2 h-4 w-4" />
          Agregar invitado
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar invitado al evento</DialogTitle>
          <DialogDescription>
            Sumá a un no-miembro a la lista de cuotas del evento.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="guest_name">Nombre completo</Label>
            <Input id="guest_name" {...register('guest_name')} placeholder="Nombre y Apellido" />
            {errors.guest_name && <p className="text-sm text-destructive">{errors.guest_name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="guest_phone">Teléfono (opcional)</Label>
            <Input id="guest_phone" {...register('guest_phone')} placeholder="+5491155551234" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount_owed">Cuota a pagar</Label>
            <Input
              id="amount_owed"
              type="number"
              step="0.01"
              {...register('amount_owed', { valueAsNumber: true })}
            />
            {errors.amount_owed && <p className="text-sm text-destructive">{errors.amount_owed.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Agregando...' : 'Agregar invitado'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ParticipantRow({
  payment,
  eventId,
  canEdit,
}: {
  payment: EventMemberPayment;
  eventId: string;
  canEdit: boolean;
}) {
  const { updatePayment, removeMemberFromEvent } = useEventMemberPayments(eventId);
  const [editingField, setEditingField] = useState<'owed' | 'paid' | null>(null);
  const [draftValue, setDraftValue] = useState<string>('');

  const isMember = !!payment.member_id;
  const displayName = isMember ? (payment.member?.full_name || 'Miembro desconocido') : payment.guest_name;
  const amountOwed = Number(payment.amount_owed);
  const amountPaid = Number(payment.amount_paid);
  const balance = amountOwed - amountPaid;
  const isPaid = amountPaid >= amountOwed && amountOwed > 0;

  const startEdit = (field: 'owed' | 'paid', current: number) => {
    setEditingField(field);
    setDraftValue(current.toString());
  };

  const saveEdit = async () => {
    const value = parseFloat(draftValue);
    if (isNaN(value) || value < 0) {
      setEditingField(null);
      return;
    }
    if (editingField === 'owed') {
      await updatePayment.mutateAsync({ id: payment.id, amount_owed: value });
    } else if (editingField === 'paid') {
      await updatePayment.mutateAsync({ id: payment.id, amount_paid: value });
    }
    setEditingField(null);
    setDraftValue('');
  };

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-col">
          <span className="font-medium">{displayName}</span>
          {!isMember && payment.guest_phone && (
            <span className="text-xs text-muted-foreground font-mono">{payment.guest_phone}</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={isMember ? 'secondary' : 'outline'}>
          {isMember ? 'Miembro' : 'Invitado'}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {editingField === 'owed' ? (
          <div className="flex items-center justify-end gap-1">
            <Input
              type="number"
              step="0.01"
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              className="w-24 h-8 text-right"
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={saveEdit}>
              <Check className="h-4 w-4 text-success" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingField(null)}>
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 font-mono"
            onClick={() => canEdit && startEdit('owed', amountOwed)}
            disabled={!canEdit}
          >
            {formatCurrency(amountOwed)}
          </Button>
        )}
      </TableCell>
      <TableCell className="text-right">
        {editingField === 'paid' ? (
          <div className="flex items-center justify-end gap-1">
            <Input
              type="number"
              step="0.01"
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              className="w-24 h-8 text-right"
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={saveEdit}>
              <Check className="h-4 w-4 text-success" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingField(null)}>
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 font-mono"
            onClick={() => canEdit && startEdit('paid', amountPaid)}
            disabled={!canEdit}
          >
            {formatCurrency(amountPaid)}
          </Button>
        )}
      </TableCell>
      <TableCell className="text-right font-mono">{formatCurrency(balance)}</TableCell>
      <TableCell className="text-center">
        <Badge variant={isPaid ? 'default' : balance > 0 ? 'destructive' : 'secondary'}>
          {isPaid ? 'Pagado' : balance > 0 ? 'Pendiente' : 'Sin cuota'}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        {canEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Quitar a {displayName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Se eliminará su registro de cuota para este evento. Los pagos ya registrados como
                  transacciones no se modifican.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => removeMemberFromEvent.mutate(payment.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Quitar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </TableCell>
    </TableRow>
  );
}

function AssignAllMembersButton({ eventId, defaultAmount }: { eventId: string; defaultAmount: number }) {
  const { createPaymentsForAllMembers } = useEventMemberPayments(eventId);
  return (
    <Button
      variant="outline"
      onClick={() =>
        createPaymentsForAllMembers.mutate({ eventId, amountPerMember: defaultAmount })
      }
      disabled={defaultAmount <= 0 || createPaymentsForAllMembers.isPending}
    >
      <PlusCircle className="mr-2 h-4 w-4" />
      Asignar a todos los miembros
    </Button>
  );
}

export default function EventOverview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const { data, isLoading, error } = useEventOverview(id);
  const { members } = useMembers();
  const { addMemberToEvent } = useEventMemberPayments(id);
  const [memberToAdd, setMemberToAdd] = useState<string>('');

  const event = data?.event ?? null;
  const payments = data?.payments ?? [];
  const transactions = data?.transactions ?? [];

  const memberIdsAlreadyIn = useMemo(
    () => new Set(payments.filter((p) => p.member_id).map((p) => p.member_id as string)),
    [payments]
  );
  const membersAvailable = useMemo(
    () => members.filter((m) => m.is_active && !memberIdsAlreadyIn.has(m.id)),
    [members, memberIdsAlreadyIn]
  );

  const kpis = useMemo(() => {
    const projectedIncome = payments.reduce((s, p) => s + Number(p.amount_owed), 0);
    const paidIncome = payments.reduce((s, p) => s + Number(p.amount_paid), 0);
    const pending = payments.reduce((s, p) => {
      const delta = Number(p.amount_owed) - Number(p.amount_paid);
      return s + (delta > 0 ? delta : 0);
    }, 0);
    const actualIncome = transactions
      .filter((t) => t.transaction_type === 'income')
      .reduce((s, t) => s + Number(t.amount), 0);
    const actualExpenses = transactions
      .filter((t) => t.transaction_type === 'expense')
      .reduce((s, t) => s + Number(t.amount), 0);
    const balance = actualIncome - actualExpenses;
    return { projectedIncome, paidIncome, pending, actualIncome, actualExpenses, balance };
  }, [payments, transactions]);

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Cargando...</div>;
  }
  if (error) {
    return <div className="text-center py-8 text-destructive">Error al cargar el evento.</div>;
  }
  if (!event) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate('/expense-categories')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Evento no encontrado.
          </CardContent>
        </Card>
      </div>
    );
  }

  const sortedPayments = [...payments].sort((a, b) => {
    const an = (a.member?.full_name || a.guest_name || '').toLocaleLowerCase();
    const bn = (b.member?.full_name || b.guest_name || '').toLocaleLowerCase();
    return an.localeCompare(bn);
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/expense-categories')} className="mb-2">
          <ArrowLeft className="mr-2 h-4 w-4" /> Eventos
        </Button>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{event.name}</h1>
            {event.description && (
              <p className="text-muted-foreground max-w-prose">{event.description}</p>
            )}
            <p className="text-sm text-muted-foreground mt-1">
              Cuota por defecto: {formatCurrency(event.default_amount)}
              {event.is_active ? '' : ' • Inactivo'}
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-2 flex-wrap">
              <AssignAllMembersButton eventId={event.id} defaultAmount={event.default_amount} />
              <AddGuestDialog eventId={event.id} defaultAmount={event.default_amount} />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ingresos proyectados</CardDescription>
            <CardTitle className="text-2xl font-mono">{formatCurrency(kpis.projectedIncome)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ingresos pagados</CardDescription>
            <CardTitle className="text-2xl font-mono">{formatCurrency(kpis.paidIncome)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pagos pendientes</CardDescription>
            <CardTitle className="text-2xl font-mono text-destructive">
              {formatCurrency(kpis.pending)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saldo del evento</CardDescription>
            <CardTitle
              className={`text-2xl font-mono ${kpis.balance >= 0 ? 'text-success' : 'text-destructive'}`}
            >
              {formatCurrency(kpis.balance)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ingresos reales (transacciones)</CardDescription>
            <CardTitle className="text-xl font-mono">{formatCurrency(kpis.actualIncome)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Egresos reales (transacciones)</CardDescription>
            <CardTitle className="text-xl font-mono">{formatCurrency(kpis.actualExpenses)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Participantes</CardTitle>
          <CardDescription>Miembros e invitados con cuotas asignadas a este evento</CardDescription>
        </CardHeader>
        <CardContent>
          {isAdmin && membersAvailable.length > 0 && (
            <div className="flex items-end gap-2 mb-4">
              <div className="flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Agregar miembro existente</Label>
                <select
                  value={memberToAdd}
                  onChange={(e) => setMemberToAdd(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Seleccionar miembro...</option>
                  {membersAvailable.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name}</option>
                  ))}
                </select>
              </div>
              <Button
                onClick={async () => {
                  if (!memberToAdd) return;
                  await addMemberToEvent.mutateAsync({
                    eventId: event.id,
                    memberId: memberToAdd,
                    amountOwed: event.default_amount,
                  });
                  setMemberToAdd('');
                }}
                disabled={!memberToAdd}
              >
                <PlusCircle className="mr-2 h-4 w-4" />
                Agregar
              </Button>
            </div>
          )}
          {sortedPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aún no hay participantes asignados.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Adeudado</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPayments.map((p) => (
                  <ParticipantRow key={p.id} payment={p} eventId={event.id} canEdit={isAdmin} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transacciones del evento</CardTitle>
          <CardDescription>
            Movimientos registrados en el módulo Transacciones con este evento como referencia
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay transacciones registradas para este evento todavía.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Miembro</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{parseLocalDate(tx.transaction_date).toLocaleDateString('es-AR')}</TableCell>
                    <TableCell>
                      <Badge variant={tx.transaction_type === 'income' ? 'default' : 'secondary'}>
                        {tx.transaction_type === 'income' ? 'Ingreso' : 'Egreso'}
                      </Badge>
                    </TableCell>
                    <TableCell>{CATEGORY_LABELS[tx.category]}</TableCell>
                    <TableCell>{tx.member?.full_name || '—'}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(tx.amount))}</TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">{tx.notes || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
