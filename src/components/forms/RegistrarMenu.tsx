/**
 * @file RegistrarMenu.tsx
 * @description Menu desplegable del boton "Registrar" (el + central del movil y
 *   el boton del Inicio/escritorio). Reune en un solo lugar las acciones rapidas
 *   de dinero: registrar un movimiento, agregar un cobro pendiente, y registrar
 *   un cobro (que primero deja elegir el cobro abierto y luego abre el pago).
 *   Para el detalle completo, la pagina /cobros sigue siendo el lugar.
 */
import { ReactNode, useState } from 'react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AddTransactionForm } from '@/components/forms/AddTransactionForm';
import { AddChargeDialog } from '@/components/cobros/AddChargeDialog';
import { RegisterPaymentDialog } from '@/components/cobros/RegisterPaymentDialog';
import { useMembers } from '@/hooks/useMembers';
import { useMemberCharges } from '@/hooks/useMemberCharges';
import { formatCurrency } from '@/lib/utils';
import { CHARGE_CATEGORY_LABELS, chargeBalance, type MemberCharge } from '@/lib/cobros-types';
import { PlusCircle, Receipt, Coins, HandCoins } from 'lucide-react';

interface Props {
  /** Custom trigger element (e.g. the mobile bottom-nav + button). */
  trigger?: ReactNode;
  triggerLabel?: string;
}

export function RegistrarMenu({ trigger, triggerLabel = 'Registrar movimiento' }: Props) {
  const [movOpen, setMovOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [payCharge, setPayCharge] = useState<MemberCharge | null>(null);

  const { memberBalances } = useMembers();
  const activeMembers = memberBalances
    .filter((m) => m.is_active)
    .map((m) => ({ member_id: m.member_id, full_name: m.full_name }));

  const { charges, createCharge, registerPayment } = useMemberCharges();
  const openCharges = charges
    .filter((c) => (c.status === 'pending' || c.status === 'partial') && chargeBalance(c) > 0.5)
    .sort((a, b) => b.charge_date.localeCompare(a.charge_date));

  // Abrir el dialogo en el tick siguiente al cierre del menu, para evitar el
  // conflicto de foco entre el DropdownMenu de Radix y el Dialog.
  const openLater = (fn: () => void) => setTimeout(fn, 0);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <Button data-asistente="mov-abrir">
              <PlusCircle className="mr-2 h-4 w-4" />
              {triggerLabel}
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-60 bg-popover">
          <DropdownMenuItem onSelect={() => openLater(() => setMovOpen(true))}>
            <Receipt className="mr-2 h-4 w-4" /> Registrar movimiento
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openLater(() => setChargeOpen(true))}>
            <Coins className="mr-2 h-4 w-4" /> Agregar cobro pendiente
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openLater(() => setPickerOpen(true))}>
            <HandCoins className="mr-2 h-4 w-4" /> Registrar cobro
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Registrar movimiento (el formulario de siempre, ahora controlado) */}
      <AddTransactionForm open={movOpen} onOpenChange={setMovOpen} />

      {/* Agregar cobro pendiente */}
      <AddChargeDialog
        open={chargeOpen}
        onOpenChange={setChargeOpen}
        members={activeMembers}
        isPending={createCharge.isPending}
        onCreate={(input) => createCharge.mutate(input, { onSuccess: () => setChargeOpen(false) })}
      />

      {/* Registrar cobro: primero se elige el cobro abierto, luego el pago */}
      <ChargePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        charges={openCharges}
        onPick={(c) => { setPickerOpen(false); openLater(() => setPayCharge(c)); }}
      />
      <RegisterPaymentDialog
        charge={payCharge}
        onOpenChange={(o) => { if (!o) setPayCharge(null); }}
        isPending={registerPayment.isPending}
        onPay={(input) => registerPayment.mutate(input, { onSuccess: () => setPayCharge(null) })}
      />
    </>
  );
}

/** Lista de cobros abiertos para elegir a cual registrar un pago. */
function ChargePickerDialog({
  open, onOpenChange, charges, onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  charges: MemberCharge[];
  onPick: (c: MemberCharge) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Elegí el cobro a registrar</DialogTitle>
        </DialogHeader>
        {charges.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No hay cobros pendientes por registrar.
          </p>
        ) : (
          <div className="space-y-1">
            {charges.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c)}
                className="press flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left hover:border-primary/40"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.member?.full_name ?? 'Hermano'}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {CHARGE_CATEGORY_LABELS[c.category]}{c.note ? ` · ${c.note}` : ''}
                  </p>
                </div>
                <span className="font-mono text-sm font-semibold shrink-0">
                  {formatCurrency(chargeBalance(c), c.currency)}
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
