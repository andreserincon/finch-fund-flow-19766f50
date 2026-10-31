/**
 * @file Agapes.tsx
 * @description Modulo de agapes (comidas entre hermanos donde UNO recauda la
 *   plata de todos). Independiente de las finanzas del taller. Direccion "Planilla
 *   de cobro": arriba la reconciliacion (lo que falta + efectivo/tarjeta), abajo la
 *   lista de comensales para ir marcando a cada uno (efectivo / tarjeta / ya pago),
 *   aplicando el % de descuento por efectivo. El reparto arranca en partes iguales
 *   y cada parte se puede ajustar. Un agape abierto a la vez; sin historial.
 */
import { useMemo, useState } from 'react';
import { useAgapes, type NewParticipant } from '@/hooks/useAgapes';
import { useMembers } from '@/hooks/useMembers';
import {
  agapeTotals, computePayment, participantName, PAYMENT_METHOD_LABELS,
  type AgapeParticipant, type AgapePaymentMethod,
} from '@/lib/agape-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UtensilsCrossed, Plus, Check, RotateCcw, Banknote, CreditCard, CircleCheck, Scale, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatCurrencyCompact, parseLocalDate, cn } from '@/lib/utils';

const fmt = (n: number) => formatCurrencyCompact(n, 'ARS');

/* ── Alta de un agape ─────────────────────────────────────────────────────── */
function NewAgapeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { createAgape } = useAgapes();
  const { memberBalances } = useMembers();
  const active = useMemo(
    () => memberBalances.filter((m) => m.is_active).map((m) => ({ id: m.member_id, name: m.full_name })),
    [memberBalances],
  );

  const today = format(new Date(), 'yyyy-MM-dd');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [total, setTotal] = useState('');
  const [tip, setTip] = useState('');
  const [discount, setDiscount] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [guests, setGuests] = useState<string[]>([]);
  const [guestDraft, setGuestDraft] = useState('');

  const pickedCount = Object.values(picked).filter(Boolean).length + guests.length;
  const objetivo = (Number(total) || 0) + (Number(tip) || 0);

  const reset = () => {
    setTitle(''); setDate(today); setTotal(''); setTip(''); setDiscount('');
    setSearch(''); setPicked({}); setGuests([]); setGuestDraft('');
  };

  const filtered = active.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));

  const addGuest = () => {
    const g = guestDraft.trim();
    if (g) { setGuests((prev) => [...prev, g]); setGuestDraft(''); }
  };

  const submit = () => {
    const participants: NewParticipant[] = [
      ...active.filter((m) => picked[m.id]).map((m) => ({ member_id: m.id, guest_name: null })),
      ...guests.map((g) => ({ member_id: null, guest_name: g })),
    ];
    createAgape.mutate(
      {
        title: title.trim() || 'Ágape',
        agape_date: date,
        total_amount: Number(total) || 0,
        tip_amount: Number(tip) || 0,
        cash_discount_pct: Number(discount) || 0,
        participants,
      },
      { onSuccess: () => { reset(); onOpenChange(false); } },
    );
  };

  const canSubmit = pickedCount > 0 && (Number(total) || 0) > 0 && !createAgape.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo ágape</DialogTitle>
          <DialogDescription>Cargá el gasto y elegí quiénes comieron. Se reparte en partes iguales.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="input-label">Lugar o motivo</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Parrilla La Rural" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="input-label">Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="input-label">Descuento efectivo (%)</Label>
              <Input type="number" inputMode="decimal" min={0} max={100} value={discount}
                onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="input-label">Total gastado</Label>
              <Input type="number" inputMode="decimal" min={0} value={total}
                onChange={(e) => setTotal(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label className="input-label">Propina</Label>
              <Input type="number" inputMode="decimal" min={0} value={tip}
                onChange={(e) => setTip(e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-muted-foreground">Objetivo a recaudar</span>
            <span className="font-semibold tabular-nums">{fmt(objetivo)}</span>
          </div>

          <div>
            <Label className="input-label">Comensales ({pickedCount})</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar hermano..." className="mb-2" />
            <ScrollArea className="h-44 rounded-lg border">
              <div className="p-1">
                {filtered.map((m) => (
                  <label key={m.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer">
                    <Checkbox checked={!!picked[m.id]} onCheckedChange={(v) => setPicked((p) => ({ ...p, [m.id]: !!v }))} />
                    <span className="text-sm">{m.name}</span>
                  </label>
                ))}
                {filtered.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">Sin resultados.</p>}
              </div>
            </ScrollArea>
          </div>

          <div>
            <Label className="input-label">Invitados (no hermanos)</Label>
            <div className="flex gap-2">
              <Input value={guestDraft} onChange={(e) => setGuestDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest(); } }}
                placeholder="Nombre del invitado" />
              <Button type="button" variant="outline" onClick={addGuest}>Agregar</Button>
            </div>
            {guests.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {guests.map((g, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {g}
                    <button type="button" onClick={() => setGuests((prev) => prev.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!canSubmit}>Crear ágape</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Ajustar la parte de un comensal ──────────────────────────────────────── */
function EditShareDialog({ target, onClose }: { target: AgapeParticipant | null; onClose: () => void }) {
  const { updateShare } = useAgapes();
  const [value, setValue] = useState('');
  const current = target ? Number(target.share_amount) : 0;

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { setValue(''); onClose(); } }}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Ajustar parte</DialogTitle>
          <DialogDescription>{target ? participantName(target) : ''}</DialogDescription>
        </DialogHeader>
        <div>
          <Label className="input-label">Monto</Label>
          <Input type="number" inputMode="decimal" min={0} autoFocus
            value={value} onChange={(e) => setValue(e.target.value)} placeholder={String(current)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setValue(''); onClose(); }}>Cancelar</Button>
          <Button
            onClick={() => {
              if (!target) return;
              updateShare.mutate(
                { participantId: target.id, share: Number(value) || 0 },
                { onSuccess: () => { setValue(''); onClose(); } },
              );
            }}
            disabled={value === '' || updateShare.isPending}
          >Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Pagina ───────────────────────────────────────────────────────────────── */
export default function Agapes() {
  const { agape, participants, isLoading, markPaid, undoPaid, redistributeEqual, closeAgape } = useAgapes();
  const [newOpen, setNewOpen] = useState(false);
  const [editShare, setEditShare] = useState<AgapeParticipant | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const totals = useMemo(() => (agape ? agapeTotals(agape, participants) : null), [agape, participants]);

  return (
    <div className="space-y-4 md:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
            <UtensilsCrossed className="h-6 w-6 text-primary" />Ágapes
          </h1>
          <p className="text-sm text-muted-foreground">
            Cobrar la comida entre hermanos. No toca las finanzas del taller.
          </p>
        </div>
        {!isLoading && !agape && (
          <Button onClick={() => setNewOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-2" />Nuevo ágape
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full rounded-2xl" />
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : !agape || !totals ? (
        <div className="text-center py-14 text-muted-foreground bg-card rounded-xl border">
          <UtensilsCrossed className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p>No hay ningún ágape abierto.</p>
          <p className="text-sm">Usá "Nuevo ágape" para empezar a cobrar una comida.</p>
        </div>
      ) : (
        <>
          {/* Encabezado de reconciliacion (la vista del que cobra) */}
          <div className="rounded-2xl p-5 text-[hsl(40_30%_90%)]" style={{ background: 'hsl(240 8% 11%)' }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display text-lg font-semibold leading-tight">{agape.title}</p>
                <p className="text-xs text-[hsl(40_18%_72%)]">
                  {format(parseLocalDate(agape.agape_date), "d 'de' MMM yyyy", { locale: es })}
                </p>
              </div>
              <span className="text-[0.65rem] font-semibold px-2 py-1 rounded-full bg-white/10">
                {totals.pagados} de {totals.total} pagaron
              </span>
            </div>
            <p className="text-[0.7rem] uppercase tracking-wider text-[hsl(42_40%_62%)] font-semibold mt-4">Falta recaudar</p>
            <p className="text-4xl font-semibold tabular-nums leading-none mt-1" style={{ color: 'hsl(42 58% 66%)' }}>
              {fmt(totals.falta)}
            </p>
            <p className="text-xs text-[hsl(40_18%_72%)] mt-1">objetivo {fmt(totals.objetivo)}</p>
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                <p className="text-[0.65rem] text-[hsl(40_18%_68%)] flex items-center gap-1.5">
                  <Banknote className="h-3.5 w-3.5" style={{ color: 'hsl(160 55% 55%)' }} />Efectivo
                </p>
                <p className="font-semibold tabular-nums mt-0.5">{fmt(totals.efectivo)}</p>
              </div>
              <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                <p className="text-[0.65rem] text-[hsl(40_18%_68%)] flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5" style={{ color: 'hsl(217 70% 65%)' }} />Tarjeta
                </p>
                <p className="font-semibold tabular-nums mt-0.5">{fmt(totals.tarjeta)}</p>
              </div>
            </div>
            {(totals.yaPago > 0 || totals.descuentos > 0) && (
              <div className="flex gap-4 mt-3 text-xs text-[hsl(40_18%_72%)]">
                {totals.yaPago > 0 && <span>Ya pagó: <b className="tabular-nums">{fmt(totals.yaPago)}</b></span>}
                {totals.descuentos > 0 && <span>Ahorro efectivo: <b className="tabular-nums">{fmt(totals.descuentos)}</b></span>}
              </div>
            )}
          </div>

          {/* Aviso si las partes no cuadran con el objetivo */}
          {Math.abs(totals.shareDiff) >= 1 && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
              <span className="text-warning flex items-center gap-2">
                <Scale className="h-4 w-4" />
                Las partes {totals.shareDiff > 0 ? 'superan' : 'no llegan'} al objetivo por {fmt(Math.abs(totals.shareDiff))}
              </span>
              <Button size="sm" variant="outline" onClick={() => redistributeEqual.mutate(participants)}>
                Partes iguales
              </Button>
            </div>
          )}

          {/* Lista de comensales */}
          <div className="flex items-center justify-between">
            <h2 className="section-header section-header-plain mb-0">Hermanos</h2>
            <Button size="sm" variant="ghost" onClick={() => redistributeEqual.mutate(participants)}
              disabled={redistributeEqual.isPending}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Repartir igual
            </Button>
          </div>

          <div className="space-y-2">
            {participants.map((p) => (
              <ParticipantRow
                key={p.id}
                p={p}
                cashDiscountPct={Number(agape.cash_discount_pct)}
                onMark={(method) => markPaid.mutate({ participant: p, method })}
                onUndo={() => undoPaid.mutate(p.id)}
                onEditShare={() => setEditShare(p)}
              />
            ))}
          </div>

          <div className="pt-2">
            <Button variant="outline" className="w-full" onClick={() => setConfirmClose(true)}>
              Cerrar ágape
            </Button>
          </div>
        </>
      )}

      <NewAgapeDialog open={newOpen} onOpenChange={setNewOpen} />
      <EditShareDialog target={editShare} onClose={() => setEditShare(null)} />

      <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar este ágape?</AlertDialogTitle>
            <AlertDialogDescription>
              Se da por terminado el cobro. Después vas a poder empezar uno nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (agape) closeAgape.mutate(agape.id); setConfirmClose(false); }}>
              Cerrar ágape
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Fila de un comensal ──────────────────────────────────────────────────── */
function ParticipantRow({
  p, cashDiscountPct, onMark, onUndo, onEditShare,
}: {
  p: AgapeParticipant;
  cashDiscountPct: number;
  onMark: (method: AgapePaymentMethod) => void;
  onUndo: () => void;
  onEditShare: () => void;
}) {
  const name = participantName(p);
  const initials = name.split(' ').slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
  const cashPreview = computePayment(Number(p.share_amount), 'efectivo', cashDiscountPct).amountPaid;

  const methodBadge = (m: AgapePaymentMethod) => {
    const label = PAYMENT_METHOD_LABELS[m];
    if (m === 'efectivo') return <Badge variant="outline" className="border-success/40 text-success">{label}</Badge>;
    if (m === 'tarjeta') return <Badge variant="outline" className="border-info/40 text-info">{label}</Badge>;
    return <Badge variant="outline" className="text-muted-foreground">{label}</Badge>;
  };

  return (
    <div className={cn(
      'flex items-center gap-3 rounded-xl border p-3 press',
      p.paid ? 'border-success/30 bg-success/5' : 'bg-card',
    )}>
      <div className="h-9 w-9 shrink-0 rounded-full bg-muted grid place-items-center text-xs font-semibold text-muted-foreground">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <button type="button" onClick={onEditShare}
          className="text-xs text-muted-foreground tabular-nums hover:text-foreground">
          {fmt(Number(p.share_amount))}
          {p.paid && Number(p.discount_applied) > 0 && (
            <span className="text-success"> → {fmt(Number(p.amount_paid))}</span>
          )}
        </button>
      </div>

      {p.paid ? (
        <div className="flex items-center gap-2">
          {p.payment_method && methodBadge(p.payment_method)}
          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={onUndo} aria-label="Deshacer">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm"><Check className="h-4 w-4 mr-1.5" />Cobrar</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onMark('efectivo')}>
              <Banknote className="h-4 w-4 mr-2 text-success" />
              Efectivo{cashDiscountPct > 0 && <span className="ml-auto pl-3 text-xs text-muted-foreground tabular-nums">{fmt(cashPreview)}</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMark('tarjeta')}>
              <CreditCard className="h-4 w-4 mr-2 text-info" />Tarjeta
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMark('ya_pago')}>
              <CircleCheck className="h-4 w-4 mr-2 text-muted-foreground" />Ya pagó
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
