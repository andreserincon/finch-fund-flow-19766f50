/**
 * @file EventOverview.tsx
 * @description Per-event summary page at /events/:id. Shows projected
 *   vs. paid income from participants, real income/expense from tagged
 *   transactions, and the participant list (members + guests). Payments
 *   are registered via a dialog that creates a real `transactions` row
 *   tagged with event_id + event_member_payment_id; the participant's
 *   amount_paid is then auto-recomputed by useTransactions.
 *
 *   Mobile: the participant roster renders as cards (the canonical
 *   md:hidden card / hidden md:block table pattern). Editing a cuota on a
 *   phone happens in a bottom sheet with a stepper, not a 32px inline cell.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, PlusCircle, UserPlus, Trash2, Check, X, Receipt, AlertTriangle, Pencil, Minus, Plus, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useEventOverview } from '@/hooks/useEventOverview';
import { useEventMemberPayments } from '@/hooks/useEventMemberPayments';
import { useMembers } from '@/hooks/useMembers';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useTransactions } from '@/hooks/useTransactions';
import { formatCurrency, formatCurrencyCompact, parseLocalDate } from '@/lib/utils';
import { ACCOUNT_LABELS, AccountType, CATEGORY_LABELS, EventMemberPayment } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/* ----------------------------- status helper ----------------------------- */

type ParticipantStatusKey = 'pagado' | 'pendiente' | 'impago' | 'demorado' | 'sincuota';

/**
 * Reconciled participant status, consistent with the lodge vocabulary used
 * elsewhere (Impago / Demorado mirror the capita scheme). Demorado depends on
 * the event payment deadline; everything else is derived from owed vs paid.
 */
function getParticipantStatus(
  owed: number,
  paid: number,
  deadline: string | null,
): { key: ParticipantStatusKey; label: string; className: string } {
  if (owed <= 0) return { key: 'sincuota', label: 'Sin cuota', className: 'bg-muted text-muted-foreground' };
  if (paid >= owed) return { key: 'pagado', label: 'Pagado', className: 'status-up-to-date' };
  const todayStr = new Date().toISOString().slice(0, 10);
  const overdue = !!deadline && deadline.slice(0, 10) < todayStr;
  if (overdue) return { key: 'demorado', label: 'Demorado', className: 'status-overdue' };
  if (paid > 0) return { key: 'pendiente', label: 'Pendiente', className: 'status-ahead' };
  return { key: 'impago', label: 'Impago', className: 'status-unpaid' };
}

function StatusChip({ owed, paid, deadline }: { owed: number; paid: number; deadline: string | null }) {
  const s = getParticipantStatus(owed, paid, deadline);
  return <span className={`status-badge ${s.className}`}>{s.label}</span>;
}

/* ----------------------------- add guest --------------------------------- */

const guestSchema = z.object({
  guest_name: z.string().min(1, 'El nombre es obligatorio').max(100),
  guest_phone: z.string().max(40).optional(),
  guest_grade: z.string().optional(),
  guest_lodge: z.string().max(120).optional(),
  amount_owed: z.number().min(0, 'El monto debe ser positivo'),
});
type GuestFormData = z.infer<typeof guestSchema>;

function AddGuestDialog({ eventId, defaultAmount, defaultInstallments, className }: { eventId: string; defaultAmount: number; defaultInstallments: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const { addGuestToEvent } = useEventMemberPayments(eventId);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
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
      guestGrade: data.guest_grade || null,
      guestLodge: data.guest_lodge || null,
      amountOwed: data.amount_owed,
      installments: defaultInstallments,
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
        <Button variant="outline" className={`press ${className ?? ''}`}>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Grado</Label>
              <Select value={watch('guest_grade') || ''} onValueChange={(v) => setValue('guest_grade', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aprendiz">Aprendiz</SelectItem>
                  <SelectItem value="companero">Compañero</SelectItem>
                  <SelectItem value="maestro">Maestro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest_lodge">Logia</Label>
              <Input id="guest_lodge" {...register('guest_lodge')} placeholder="Nombre de la logia" />
            </div>
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

/* ----------------------------- payment dialog ---------------------------- */

const paymentSchema = z.object({
  amount: z.number().positive('El monto debe ser positivo'),
  account: z.enum(['bank', 'great_lodge', 'savings']),
  transaction_date: z.string().min(1, 'La fecha es obligatoria'),
  notes: z.string().max(500).optional(),
});
type PaymentFormData = z.infer<typeof paymentSchema>;

function RegisterPaymentDialog({
  payment,
  eventId,
  trigger,
}: {
  payment: EventMemberPayment;
  eventId: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { addTransaction } = useTransactions();

  const balance = Math.max(0, Number(payment.amount_owed) - Number(payment.amount_paid));
  const displayName = payment.member?.full_name || payment.guest_name || 'Participante';

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      amount: balance > 0 ? balance : Number(payment.amount_owed),
      account: 'bank',
      transaction_date: new Date().toISOString().split('T')[0],
    },
  });
  const account = watch('account');

  const onSubmit = async (data: PaymentFormData) => {
    await addTransaction.mutateAsync({
      transaction_date: data.transaction_date,
      amount: data.amount,
      transaction_type: 'income',
      category: 'event_payment',
      account: data.account,
      member_id: payment.member_id ?? null,
      event_id: eventId,
      event_member_payment_id: payment.id,
      notes: data.notes || null,
    });
    reset({
      amount: balance > 0 ? balance : Number(payment.amount_owed),
      account: 'bank',
      transaction_date: new Date().toISOString().split('T')[0],
    });
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset({
            amount: balance > 0 ? balance : Number(payment.amount_owed),
            account: 'bank',
            transaction_date: new Date().toISOString().split('T')[0],
          });
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago de {displayName}</DialogTitle>
          <DialogDescription>
            Crea una transacción de ingreso vinculada a este participante. El saldo del evento
            y de la cuenta seleccionada se actualizan automáticamente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Monto</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                {...register('amount', { valueAsNumber: true })}
              />
              {errors.amount && (
                <p className="text-sm text-destructive">{errors.amount.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="transaction_date">Fecha</Label>
              <Input
                id="transaction_date"
                type="date"
                {...register('transaction_date')}
              />
              {errors.transaction_date && (
                <p className="text-sm text-destructive">{errors.transaction_date.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cuenta</Label>
            <Select
              value={account}
              onValueChange={(value) => setValue('account', value as AccountType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['bank', 'great_lodge', 'savings'] as AccountType[]).map((acc) => (
                  <SelectItem key={acc} value={acc}>
                    {ACCOUNT_LABELS[acc]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input id="notes" {...register('notes')} placeholder="Detalle del pago..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Registrando...' : 'Registrar pago'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------- participant edit (bottom sheet) ----------------- */

/**
 * Mobile and desktop friendly edit of a participant's total owed and number of
 * cuotas. The cuotas control is a stepper (1 to 36), so no keyboard is needed
 * and there is no 32px inline cell to mis-tap.
 */
function ParticipantEditSheet({ payment, eventId }: { payment: EventMemberPayment; eventId: string }) {
  const { updatePayment } = useEventMemberPayments(eventId);
  const [open, setOpen] = useState(false);
  const [owed, setOwed] = useState<string>(String(Number(payment.amount_owed)));
  const [cuotas, setCuotas] = useState<number>(Number(payment.installments) || 1);
  const displayName = payment.member?.full_name || payment.guest_name || 'Participante';

  const onOpenChange = (next: boolean) => {
    if (next) {
      setOwed(String(Number(payment.amount_owed)));
      setCuotas(Number(payment.installments) || 1);
    }
    setOpen(next);
  };

  const owedNum = parseFloat(owed);
  const perCuota = cuotas > 0 && !isNaN(owedNum) ? owedNum / cuotas : 0;

  const save = async () => {
    const value = parseFloat(owed);
    await updatePayment.mutateAsync({
      id: payment.id,
      amount_owed: isNaN(value) || value < 0 ? Number(payment.amount_owed) : value,
      installments: cuotas,
    });
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="press">
          <Pencil className="mr-1 h-4 w-4" />
          Editar
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[90dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar cuota</SheetTitle>
          <SheetDescription>{displayName}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-owed">Debe (cuota total)</Label>
            <Input
              id="edit-owed"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={owed}
              onChange={(e) => setOwed(e.target.value)}
              className="h-12 text-lg font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label>Cuotas</Label>
            <div className="flex items-center gap-4">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 press"
                onClick={() => setCuotas((c) => Math.max(1, c - 1))}
                disabled={cuotas <= 1}
                aria-label="Quitar una cuota"
              >
                <Minus className="h-5 w-5" />
              </Button>
              <span className="w-12 text-center text-2xl font-mono tabular-nums">{cuotas}</span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-12 w-12 press"
                onClick={() => setCuotas((c) => Math.min(36, c + 1))}
                disabled={cuotas >= 36}
                aria-label="Agregar una cuota"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {cuotas > 1 ? `${cuotas} cuotas de ${formatCurrency(perCuota)}` : 'Pago en una sola cuota'}
            </p>
          </div>
        </div>
        <SheetFooter className="gap-2">
          <SheetClose asChild>
            <Button type="button" variant="outline" className="h-11 w-full sm:w-auto">Cancelar</Button>
          </SheetClose>
          <Button type="button" className="h-11 w-full sm:w-auto press" onClick={save} disabled={updatePayment.isPending}>
            {updatePayment.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------- remove participant ---------------------------- */

function RemoveParticipantDialog({ payment, eventId, displayName }: { payment: EventMemberPayment; eventId: string; displayName: string }) {
  const { removeMemberFromEvent } = useEventMemberPayments(eventId);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="press text-destructive hover:text-destructive">
          <Trash2 className="mr-1 h-4 w-4" />
          Quitar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Quitar a {displayName}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará su registro de cuota para este evento. Las transacciones ya
            registradas no se modifican.
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
  );
}

/* --------------------- participant card (mobile) ------------------------- */

function ParticipantCard({
  payment,
  eventId,
  canEdit,
  hasTransactions,
  paymentDeadline,
}: {
  payment: EventMemberPayment;
  eventId: string;
  canEdit: boolean;
  hasTransactions: boolean;
  paymentDeadline: string | null;
}) {
  const isMember = !!payment.member_id;
  const displayName = isMember ? (payment.member?.full_name || 'Miembro desconocido') : payment.guest_name;
  const amountOwed = Number(payment.amount_owed);
  const amountPaid = Number(payment.amount_paid);
  const balance = amountOwed - amountPaid;
  const installments = Number(payment.installments) || 1;
  const perCuota = installments > 0 ? amountOwed / installments : amountOwed;
  const isOrphanPaid = amountPaid > 0 && !hasTransactions;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{displayName}</p>
            <span className={`status-badge ${isMember ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {isMember ? 'Miembro' : 'Invitado'}
            </span>
          </div>
          {!isMember && payment.guest_phone && (
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{payment.guest_phone}</p>
          )}
        </div>
        <StatusChip owed={amountOwed} paid={amountPaid} deadline={paymentDeadline} />
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm border-t border-border/50 pt-3">
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-xs">Debe</p>
          <p className="font-mono tabular-nums font-semibold">{formatCurrency(amountOwed)}</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-xs">Pago</p>
          <p className="font-mono tabular-nums font-semibold flex items-center gap-1">
            {isOrphanPaid && (
              <span title="Pago marcado manualmente sin transacción asociada.">
                <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
              </span>
            )}
            {formatCurrency(amountPaid)}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-muted-foreground text-xs">Saldo</p>
          <p className={`font-mono tabular-nums font-semibold ${balance > 0 ? 'text-destructive' : ''}`}>
            {formatCurrency(balance)}
          </p>
        </div>
      </div>

      {installments > 1 && (
        <p className="text-xs text-muted-foreground">{installments} cuotas de {formatCurrency(perCuota)}</p>
      )}

      {canEdit && (
        <div className="space-y-2 pt-1">
          <RegisterPaymentDialog
            payment={payment}
            eventId={eventId}
            trigger={
              <Button className="w-full h-11 press">
                <Receipt className="mr-2 h-4 w-4" />
                Registrar pago
              </Button>
            }
          />
          <div className="flex gap-2">
            <ParticipantEditSheet payment={payment} eventId={eventId} />
            <RemoveParticipantDialog payment={payment} eventId={eventId} displayName={displayName || 'este participante'} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------- participant row (desktop) ----------------------- */

function ParticipantRow({
  payment,
  eventId,
  canEdit,
  hasTransactions,
  paymentDeadline,
}: {
  payment: EventMemberPayment;
  eventId: string;
  canEdit: boolean;
  hasTransactions: boolean;
  paymentDeadline: string | null;
}) {
  const { updatePayment, removeMemberFromEvent } = useEventMemberPayments(eventId);
  const [editingOwed, setEditingOwed] = useState(false);
  const [draftOwed, setDraftOwed] = useState<string>('');
  const [editingCuotas, setEditingCuotas] = useState(false);
  const [draftCuotas, setDraftCuotas] = useState<string>('');

  const isMember = !!payment.member_id;
  const displayName = isMember ? (payment.member?.full_name || 'Miembro desconocido') : payment.guest_name;
  const amountOwed = Number(payment.amount_owed);
  const amountPaid = Number(payment.amount_paid);
  const balance = amountOwed - amountPaid;
  const installments = Number(payment.installments) || 1;
  const perCuota = installments > 0 ? amountOwed / installments : amountOwed;
  const isOrphanPaid = amountPaid > 0 && !hasTransactions;

  const saveOwed = async () => {
    const value = parseFloat(draftOwed);
    if (isNaN(value) || value < 0) {
      setEditingOwed(false);
      return;
    }
    await updatePayment.mutateAsync({ id: payment.id, amount_owed: value });
    setEditingOwed(false);
    setDraftOwed('');
  };

  const saveCuotas = async () => {
    const value = parseInt(draftCuotas, 10);
    if (isNaN(value) || value < 1 || value > 36) {
      setEditingCuotas(false);
      return;
    }
    await updatePayment.mutateAsync({ id: payment.id, installments: value });
    setEditingCuotas(false);
    setDraftCuotas('');
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
        {editingOwed ? (
          <div className="flex items-center justify-end gap-1">
            <Input
              type="number"
              step="0.01"
              value={draftOwed}
              onChange={(e) => setDraftOwed(e.target.value)}
              className="w-24 h-8 text-right"
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={saveOwed} aria-label="Confirmar">
              <Check className="h-4 w-4 text-success" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingOwed(false)} aria-label="Cancelar">
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="group h-8 px-2 font-mono"
            onClick={() => {
              if (!canEdit) return;
              setEditingOwed(true);
              setDraftOwed(amountOwed.toString());
            }}
            disabled={!canEdit}
          >
            {formatCurrency(amountOwed)}
            {canEdit && <Pencil className="ml-1.5 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" />}
          </Button>
        )}
      </TableCell>
      <TableCell className="text-center">
        {editingCuotas ? (
          <div className="flex items-center justify-center gap-1">
            <Input
              type="number"
              min="1"
              max="36"
              step="1"
              value={draftCuotas}
              onChange={(e) => setDraftCuotas(e.target.value)}
              className="w-16 h-8 text-center"
              autoFocus
            />
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={saveCuotas} aria-label="Confirmar">
              <Check className="h-4 w-4 text-success" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingCuotas(false)} aria-label="Cancelar">
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2"
            onClick={() => {
              if (!canEdit) return;
              setEditingCuotas(true);
              setDraftCuotas(String(installments));
            }}
            disabled={!canEdit}
            title={installments > 1 ? `${installments} cuotas de ${formatCurrency(perCuota)}` : 'Pago en una sola cuota'}
          >
            <span className="font-mono">{installments}</span>
            {installments > 1 && (
              <span className="ml-1 text-xs text-muted-foreground">({formatCurrency(perCuota)})</span>
            )}
          </Button>
        )}
      </TableCell>
      <TableCell className="text-right font-mono">
        <div className="flex items-center justify-end gap-1.5">
          {isOrphanPaid && (
            <span title="Pago marcado manualmente sin transacción asociada. Registrar pago para reflejarlo en el saldo de la cuenta.">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            </span>
          )}
          {formatCurrency(amountPaid)}
        </div>
      </TableCell>
      <TableCell className="text-right font-mono">{formatCurrency(balance)}</TableCell>
      <TableCell className="text-center">
        <StatusChip owed={amountOwed} paid={amountPaid} deadline={paymentDeadline} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {canEdit && (
            <RegisterPaymentDialog
              payment={payment}
              eventId={eventId}
              trigger={
                <Button variant="outline" size="sm">
                  <Receipt className="mr-1 h-4 w-4" />
                  Registrar pago
                </Button>
              }
            />
          )}
          {canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Quitar participante">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Quitar a {displayName}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminará su registro de cuota para este evento. Las transacciones ya
                    registradas no se modifican.
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
        </div>
      </TableCell>
    </TableRow>
  );
}

function AssignAllMembersButton({ eventId, defaultAmount, defaultInstallments, className }: { eventId: string; defaultAmount: number; defaultInstallments: number; className?: string }) {
  const { createPaymentsForAllMembers } = useEventMemberPayments(eventId);
  return (
    <Button
      variant="outline"
      className={`press ${className ?? ''}`}
      onClick={() =>
        createPaymentsForAllMembers.mutate({ eventId, amountPerMember: defaultAmount, installments: defaultInstallments })
      }
      disabled={defaultAmount <= 0 || createPaymentsForAllMembers.isPending}
    >
      <PlusCircle className="mr-2 h-4 w-4" />
      Asignar a todos los miembros
    </Button>
  );
}

type StatusFilter = 'pendientes' | 'todos' | 'pagados';

export default function EventOverview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const { data, isLoading, error } = useEventOverview(id);
  const { members } = useMembers();
  const { addMemberToEvent } = useEventMemberPayments(id);
  const [memberToAdd, setMemberToAdd] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pendientes');
  const [generatingRoster, setGeneratingRoster] = useState(false);

  // Generate the branded attendance roster PDF (members + guests) via the
  // generate-event-roster edge function, then download it in the browser.
  const handleGenerateRoster = async () => {
    if (!id) return;
    setGeneratingRoster(true);
    try {
      const { data: res, error: fnError } = await supabase.functions.invoke('generate-event-roster', {
        body: { eventId: id },
      });
      if (fnError) throw new Error(fnError.message);
      if (res?.error) throw new Error(res.error);
      const bytes = Uint8Array.from(atob(res.pdfBase64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || 'asistencia.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo generar el reporte.');
    } finally {
      setGeneratingRoster(false);
    }
  };

  const event = data?.event ?? null;
  const payments = data?.payments ?? [];
  const transactions = data?.transactions ?? [];

  const memberIdsAlreadyIn = new Set(payments.filter((p) => p.member_id).map((p) => p.member_id as string));
  const membersAvailable = members
    .filter((m) => m.is_active && !memberIdsAlreadyIn.has(m.id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'));

  // Set of participant ids that already have at least one transaction
  // referencing them. Used to flag "Pagado" rows that pre-date the
  // event_member_payment_id link and need a transaction registered.
  const participantsWithTransactions = new Set<string>();
  for (const tx of transactions) {
    if (tx.event_member_payment_id) participantsWithTransactions.add(tx.event_member_payment_id);
  }

  const orphanCount = payments.filter(
    (p) => Number(p.amount_paid) > 0 && !participantsWithTransactions.has(p.id)
  ).length;

  const projectedIncome = payments.reduce((s, p) => s + Number(p.amount_owed), 0);
  const paidIncome = payments.reduce((s, p) => s + Number(p.amount_paid), 0);
  const pendingTotal = payments.reduce((s, p) => {
    const delta = Number(p.amount_owed) - Number(p.amount_paid);
    return s + (delta > 0 ? delta : 0);
  }, 0);
  const actualIncome = transactions
    .filter((t) => t.transaction_type === 'income')
    .reduce((s, t) => s + Number(t.amount), 0);
  const actualExpenses = transactions
    .filter((t) => t.transaction_type === 'expense')
    .reduce((s, t) => s + Number(t.amount), 0);
  const eventBalance = actualIncome - actualExpenses;

  const totalParticipants = payments.length;
  const memberParticipants = payments.filter((p) => p.member_id).length;
  const guestParticipants = totalParticipants - memberParticipants;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="space-y-2">
          <Skeleton className="h-8 w-8 rounded-md" />
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
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

  const paymentDeadline = (event as { payment_deadline?: string | null }).payment_deadline ?? null;
  const eventInstallments = (event as { installments?: number }).installments ?? 1;

  const sortedPayments = [...payments].sort((a, b) => {
    const an = (a.member?.full_name || a.guest_name || '').toLocaleLowerCase();
    const bn = (b.member?.full_name || b.guest_name || '').toLocaleLowerCase();
    return an.localeCompare(bn);
  });

  const counts = sortedPayments.reduce(
    (acc, p) => {
      const st = getParticipantStatus(Number(p.amount_owed), Number(p.amount_paid), paymentDeadline).key;
      if (st === 'pagado') acc.pagados += 1;
      else if (st === 'impago' || st === 'pendiente' || st === 'demorado') acc.pendientes += 1;
      return acc;
    },
    { pendientes: 0, pagados: 0 }
  );

  const filteredPayments = sortedPayments.filter((p) => {
    const st = getParticipantStatus(Number(p.amount_owed), Number(p.amount_paid), paymentDeadline).key;
    if (statusFilter === 'todos') return true;
    if (statusFilter === 'pagados') return st === 'pagado';
    return st === 'impago' || st === 'pendiente' || st === 'demorado';
  });

  const chips: { value: StatusFilter; label: string }[] = [
    { value: 'pendientes', label: counts.pendientes > 0 ? `Pendientes (${counts.pendientes})` : 'Pendientes' },
    { value: 'todos', label: 'Todos' },
    { value: 'pagados', label: counts.pagados > 0 ? `Pagados (${counts.pagados})` : 'Pagados' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/expense-categories')} className="mb-2 press">
            <ArrowLeft className="mr-2 h-4 w-4" /> Eventos
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{event.name}</h1>
          {event.description && (
            <p className="text-muted-foreground max-w-prose">{event.description}</p>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            Cuota por defecto: {formatCurrency(event.default_amount)}
            {event.is_active ? '' : ' (inactivo)'}
          </p>
        </div>
        <Button
          variant="outline"
          className="press shrink-0 sm:mt-9"
          onClick={handleGenerateRoster}
          disabled={generatingRoster}
        >
          <FileText className="mr-2 h-4 w-4" />
          {generatingRoster ? 'Generando...' : 'Lista de asistencia'}
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="stat-card">
          <p className="stat-label">Ingresos proyectados</p>
          <p className="mt-1 text-lg sm:text-xl font-mono tabular-nums font-semibold">{formatCurrencyCompact(projectedIncome)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Ingresos pagados</p>
          <p className="mt-1 text-lg sm:text-xl font-mono tabular-nums font-semibold">{formatCurrencyCompact(paidIncome)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Pagos pendientes</p>
          <p className="mt-1 text-lg sm:text-xl font-mono tabular-nums font-semibold text-destructive">{formatCurrencyCompact(pendingTotal)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Saldo del evento</p>
          <p className={`mt-1 text-lg sm:text-xl font-mono tabular-nums font-semibold ${eventBalance >= 0 ? 'text-success' : 'text-destructive'}`}>
            {formatCurrencyCompact(eventBalance)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="stat-card">
          <p className="stat-label">Ingresos reales (transacciones)</p>
          <p className="mt-1 text-lg sm:text-xl font-mono tabular-nums font-semibold">{formatCurrencyCompact(actualIncome)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Egresos reales (transacciones)</p>
          <p className="mt-1 text-lg sm:text-xl font-mono tabular-nums font-semibold">{formatCurrencyCompact(actualExpenses)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Participantes</p>
          <p className="mt-1 text-lg sm:text-xl font-mono tabular-nums font-semibold">{totalParticipants}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{memberParticipants} miembros · {guestParticipants} invitados</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Participantes</CardTitle>
          <CardDescription>Miembros e invitados con cuota asignada a este evento</CardDescription>
          {orphanCount > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
              <p className="text-muted-foreground">
                <span className="font-medium text-warning-foreground">{orphanCount} pago(s) sin transacción.</span>{' '}
                El saldo de las cuentas no se actualiza hasta registrar el pago en cada fila marcada.
              </p>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isAdmin && (
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
              {membersAvailable.length > 0 && (
                <div className="flex-1 space-y-1">
                  <Label htmlFor="add-member" className="text-xs text-muted-foreground">Agregar miembro existente</Label>
                  <div className="flex gap-2">
                    <Select value={memberToAdd} onValueChange={setMemberToAdd}>
                      <SelectTrigger id="add-member" className="w-full">
                        <SelectValue placeholder="Seleccionar miembro..." />
                      </SelectTrigger>
                      <SelectContent>
                        {membersAvailable.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      className="press shrink-0"
                      onClick={async () => {
                        if (!memberToAdd) return;
                        await addMemberToEvent.mutateAsync({
                          eventId: event.id,
                          memberId: memberToAdd,
                          amountOwed: event.default_amount,
                          installments: eventInstallments,
                        });
                        setMemberToAdd('');
                      }}
                      disabled={!memberToAdd}
                    >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Agregar
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <AddGuestDialog eventId={event.id} defaultAmount={event.default_amount} defaultInstallments={eventInstallments} className="w-full sm:w-auto" />
                <AssignAllMembersButton eventId={event.id} defaultAmount={event.default_amount} defaultInstallments={eventInstallments} className="w-full sm:w-auto" />
              </div>
            </div>
          )}

          {sortedPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>Aún no hay participantes asignados.</p>
              {isAdmin && (
                <div className="mt-3 inline-flex">
                  <AssignAllMembersButton eventId={event.id} defaultAmount={event.default_amount} defaultInstallments={eventInstallments} />
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {chips.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setStatusFilter(c.value)}
                    className={`press rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      statusFilter === c.value
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border bg-card text-muted-foreground'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              {filteredPayments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay participantes en este filtro.
                </div>
              ) : (
                <>
                  {/* Mobile card view */}
                  <div className="md:hidden space-y-3">
                    {filteredPayments.map((p) => (
                      <ParticipantCard
                        key={p.id}
                        payment={p}
                        eventId={event.id}
                        canEdit={isAdmin}
                        hasTransactions={participantsWithTransactions.has(p.id)}
                        paymentDeadline={paymentDeadline}
                      />
                    ))}
                  </div>

                  {/* Desktop table view */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead className="text-right">Adeudado</TableHead>
                          <TableHead className="text-center">Cuotas</TableHead>
                          <TableHead className="text-right">Pagado</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                          <TableHead className="text-center">Estado</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredPayments.map((p) => (
                          <ParticipantRow
                            key={p.id}
                            payment={p}
                            eventId={event.id}
                            canEdit={isAdmin}
                            hasTransactions={participantsWithTransactions.has(p.id)}
                            paymentDeadline={paymentDeadline}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </>
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
            <>
              {/* Mobile card view */}
              <div className="md:hidden space-y-3">
                {transactions.map((tx) => (
                  <div key={tx.id} className="rounded-lg border bg-card p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{tx.member?.full_name || CATEGORY_LABELS[tx.category]}</p>
                        <p className="text-xs text-muted-foreground">
                          {parseLocalDate(tx.transaction_date).toLocaleDateString('es-AR')} . {CATEGORY_LABELS[tx.category]}
                        </p>
                      </div>
                      <p className={`font-mono tabular-nums font-semibold shrink-0 ${tx.transaction_type === 'income' ? 'text-success' : 'text-destructive'}`}>
                        {tx.transaction_type === 'income' ? '+' : '-'}{formatCurrency(Number(tx.amount))}
                      </p>
                    </div>
                    {tx.notes && <p className="text-sm text-muted-foreground">{tx.notes}</p>}
                  </div>
                ))}
              </div>

              {/* Desktop table view */}
              <div className="hidden md:block">
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
                        <TableCell>{tx.member?.full_name || 'Sin miembro'}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(tx.amount))}</TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate">{tx.notes || ''}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
