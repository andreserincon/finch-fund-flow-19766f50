import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import {
  CHARGE_CATEGORY_OPTIONS, chargeBalance,
  type ChargeCategory, type ChargeCurrency, type MemberCharge,
} from '@/lib/cobros-types';

interface Props {
  charge: MemberCharge | null;
  members: { member_id: string; full_name: string }[];
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onSave: (input: {
    charge: MemberCharge;
    member_id: string;
    category: ChargeCategory;
    note?: string;
    amount: number;
    currency: ChargeCurrency;
    charge_date: string;
  }) => void;
}

export function EditChargeDialog({ charge, members, onOpenChange, isPending, onSave }: Props) {
  const [memberId, setMemberId] = useState('');
  const [category, setCategory] = useState<ChargeCategory>('medalla');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<ChargeCurrency>('ARS');
  const [chargeDate, setChargeDate] = useState('');

  useEffect(() => {
    if (charge) {
      setMemberId(charge.member_id);
      setCategory(charge.category);
      setNote(charge.note ?? '');
      setAmount(String(Number(charge.amount)));
      setCurrency(charge.currency);
      setChargeDate(charge.charge_date.slice(0, 10));
    }
  }, [charge]);

  // Si el cobro ya tiene pagos, el hermano y la moneda quedan fijos (los pagos
  // y sus transacciones estan atados a ellos), y el monto no puede bajar de lo
  // ya cobrado.
  const paid = charge ? Number(charge.amount_paid) : 0;
  const hasPayments = paid > 0.001;
  const amountNum = parseFloat(amount);
  const canSubmit = !!charge && !!memberId
    && Number.isFinite(amountNum) && amountNum > 0 && amountNum >= paid - 0.001;

  const handleSave = () => {
    if (!charge || !canSubmit) return;
    onSave({
      charge,
      member_id: memberId,
      category,
      note: note || undefined,
      amount: amountNum,
      currency,
      charge_date: chargeDate,
    });
  };

  return (
    <Dialog open={!!charge} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar cargo</DialogTitle>
        </DialogHeader>
        {charge && (
          <div className="space-y-4">
            {hasPayments && (
              <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                Este cobro ya tiene pagos ({formatCurrency(paid, charge.currency)} cobrado,
                saldo {formatCurrency(chargeBalance(charge), charge.currency)}). El hermano y la
                moneda no se pueden cambiar, y el monto no puede ser menor a lo ya cobrado.
              </div>
            )}

            <div className="space-y-2">
              <Label>Hermano *</Label>
              <Select value={memberId} onValueChange={setMemberId} disabled={hasPayments}>
                <SelectTrigger><SelectValue placeholder="Seleccionar hermano..." /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {members.map((m) => (
                    <SelectItem key={m.member_id} value={m.member_id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Concepto *</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as ChargeCategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {CHARGE_CATEGORY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={currency} onValueChange={(v) => setCurrency(v as ChargeCurrency)} disabled={hasPayments}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="ARS">Pesos (ARS)</SelectItem>
                    <SelectItem value="USD">Dólares (USD)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Monto *</Label>
                <Input type="number" min={paid || 0} step="0.01" value={amount}
                  onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={chargeDate} onChange={(e) => setChargeDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nota (opcional)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                placeholder="Detalle del cargo..." />
            </div>

            {Number.isFinite(amountNum) && amountNum < paid - 0.001 && (
              <p className="text-xs text-destructive">El monto no puede ser menor a lo ya cobrado ({formatCurrency(paid, charge.currency)}).</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!canSubmit || isPending}>
            {isPending ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
