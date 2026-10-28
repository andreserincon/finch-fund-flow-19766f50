import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onAdd: (input: {
    quantity: number;
    movement_date: string;
    reason: 'compra' | 'ajuste_entrada';
    note?: string;
  }) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function AddStockDialog({ open, onOpenChange, isPending, onAdd }: Props) {
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState<'compra' | 'ajuste_entrada'>('compra');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');

  const reset = () => { setQuantity('1'); setReason('compra'); setDate(today()); setNote(''); };
  const qtyNum = parseInt(quantity, 10);
  const canSubmit = Number.isInteger(qtyNum) && qtyNum > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onAdd({ quantity: qtyNum, movement_date: date, reason, note: note || undefined });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar entrada de medallas</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Cantidad *</Label>
              <Input type="number" min="1" step="1" value={quantity}
                onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as 'compra' | 'ajuste_entrada')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="compra">Compra</SelectItem>
                <SelectItem value="ajuste_entrada">Ajuste (entrada)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nota (opcional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Proveedor, lote, etc." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
            {isPending ? 'Guardando...' : 'Registrar entrada'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
