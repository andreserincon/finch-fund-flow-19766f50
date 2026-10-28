import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CHARGE_CATEGORY_OPTIONS, type ChargeCategory, type ChargeCurrency } from '@/lib/cobros-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: { member_id: string; full_name: string }[];
  isPending: boolean;
  onCreate: (input: {
    member_id: string;
    category: ChargeCategory;
    note?: string;
    amount: number;
    currency: ChargeCurrency;
    charge_date: string;
  }) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function AddChargeDialog({ open, onOpenChange, members, isPending, onCreate }: Props) {
  const [memberId, setMemberId] = useState('');
  const [category, setCategory] = useState<ChargeCategory>('medalla');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<ChargeCurrency>('ARS');
  const [chargeDate, setChargeDate] = useState(today());

  const reset = () => {
    setMemberId(''); setCategory('medalla'); setNote('');
    setAmount(''); setCurrency('ARS'); setChargeDate(today());
  };

  const amountNum = parseFloat(amount);
  const canSubmit = !!memberId && Number.isFinite(amountNum) && amountNum > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onCreate({
      member_id: memberId,
      category,
      note: note || undefined,
      amount: amountNum,
      currency,
      charge_date: chargeDate,
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo cobro pendiente</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Hermano *</Label>
            <Select value={memberId} onValueChange={setMemberId}>
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
              <Select value={currency} onValueChange={(v) => setCurrency(v as ChargeCurrency)}>
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
              <Input type="number" min="0" step="0.01" value={amount}
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
            {isPending ? 'Guardando...' : 'Registrar cargo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
