import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { chargeBalance, type MemberCharge } from '@/lib/cobros-types';
import type { AccountType } from '@/lib/types';

interface Props {
  charge: MemberCharge | null;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onPay: (input: { charge: MemberCharge; amount: number; account: AccountType; payment_date: string }) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

export function RegisterPaymentDialog({ charge, onOpenChange, isPending, onPay }: Props) {
  const [amount, setAmount] = useState('');
  const [account, setAccount] = useState<AccountType>('bank');
  const [paymentDate, setPaymentDate] = useState(today());

  const balance = charge ? chargeBalance(charge) : 0;

  useEffect(() => {
    if (charge) {
      setAmount(String(chargeBalance(charge)));
      setAccount(charge.currency === 'USD' ? 'savings' : 'bank');
      setPaymentDate(today());
    }
  }, [charge]);

  const amountNum = parseFloat(amount);
  const canSubmit = !!charge && Number.isFinite(amountNum) && amountNum > 0 && amountNum <= balance + 0.001;

  const handleSubmit = () => {
    if (!charge || !canSubmit) return;
    onPay({ charge, amount: amountNum, account, payment_date: paymentDate });
  };

  return (
    <Dialog open={!!charge} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar cobro</DialogTitle>
        </DialogHeader>
        {charge && (
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo pendiente</span>
                <span className="font-semibold">{formatCurrency(balance, charge.currency)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Al registrar el cobro se genera un Ingreso (Otro Ingreso) en la cuenta elegida.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Monto a cobrar *</Label>
                <Input type="number" min="0" step="0.01" value={amount}
                  onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cuenta donde entra</Label>
              <Select value={account} onValueChange={(v) => setAccount(v as AccountType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="bank">Cuenta principal (pesos)</SelectItem>
                  <SelectItem value="great_lodge">Cuenta Gran Logia</SelectItem>
                  <SelectItem value="savings">Ahorro (dólares)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {Number.isFinite(amountNum) && amountNum > balance + 0.001 && (
              <p className="text-xs text-destructive">El monto no puede superar el saldo pendiente.</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || isPending}>
            {isPending ? 'Guardando...' : 'Registrar cobro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
