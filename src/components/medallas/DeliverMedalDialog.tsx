import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ChargeCurrency } from '@/lib/cobros-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: { member_id: string; full_name: string }[];
  isPending: boolean;
  onDeliver: (input: {
    member_id: string;
    movement_date: string;
    withCharge: boolean;
    amount?: number;
    currency?: ChargeCurrency;
    note?: string;
  }) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function DeliverMedalDialog({ open, onOpenChange, members, isPending, onDeliver }: Props) {
  const [memberId, setMemberId] = useState('');
  const [date, setDate] = useState(today());
  const [kind, setKind] = useState<'con_cargo' | 'iniciacion'>('con_cargo');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<ChargeCurrency>('ARS');
  const [note, setNote] = useState('');

  const reset = () => {
    setMemberId(''); setDate(today()); setKind('con_cargo');
    setAmount(''); setCurrency('ARS'); setNote('');
  };

  const amountNum = parseFloat(amount);
  const withCharge = kind === 'con_cargo';
  const canSubmit = !!memberId && (!withCharge || (Number.isFinite(amountNum) && amountNum > 0));

  const handleSubmit = () => {
    if (!canSubmit) return;
    onDeliver({
      member_id: memberId,
      movement_date: date,
      withCharge,
      amount: withCharge ? amountNum : undefined,
      currency: withCharge ? currency : undefined,
      note: note || undefined,
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Entregar medalla</DialogTitle>
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
              <Label>Tipo de entrega</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as 'con_cargo' | 'iniciacion')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="con_cargo">Con cargo (a cobrar)</SelectItem>
                  <SelectItem value="iniciacion">Iniciación (sin cobro)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {withCharge && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Monto a cobrar *</Label>
                <Input type="number" min="0" step="0.01" value={amount}
                  onChange={(e) => setAmount(e.target.value)} placeholder="0,00" />
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
          )}

          <div className="space-y-2">
            <Label>Nota (opcional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalle de la entrega..." />
          </div>

          <p className="text-xs text-muted-foreground">
            {withCharge
              ? 'Descuenta una medalla del stock y crea un cobro pendiente a ese hermano.'
              : 'Descuenta una medalla del stock, sin cobro.'}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
            {isPending ? 'Guardando...' : 'Entregar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
