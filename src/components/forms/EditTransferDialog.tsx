import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAccountTransfers } from '@/hooks/useAccountTransfers';
import { AccountTransfer, AccountType, ACCOUNT_LABELS } from '@/lib/types';
import { getCurrencyForAccount } from '@/lib/utils';

const transferSchema = z.object({
  transfer_date: z.string().min(1, 'La fecha es obligatoria'),
  amount: z.number().positive('El monto debe ser positivo'),
  // Origin-currency amount; only used (and required) on cross-currency transfers
  source_amount: z.number().optional(),
  from_account: z.enum(['bank', 'great_lodge', 'savings']),
  to_account: z.enum(['bank', 'great_lodge', 'savings']),
  notes: z.string().max(500).optional(),
}).refine(data => data.from_account !== data.to_account, {
  message: 'Las cuentas de origen y destino deben ser distintas',
  path: ['to_account'],
}).refine(data => {
  const cross = getCurrencyForAccount(data.from_account) !== getCurrencyForAccount(data.to_account);
  return !cross || (typeof data.source_amount === 'number' && data.source_amount > 0);
}, {
  message: 'Ingresá el monto que sale de la cuenta de origen',
  path: ['source_amount'],
});

type TransferFormData = z.infer<typeof transferSchema>;

interface EditTransferDialogProps {
  transfer: AccountTransfer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTransferDialog({
  transfer,
  open,
  onOpenChange,
}: EditTransferDialogProps) {
  const { updateTransfer } = useAccountTransfers();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      transfer_date: transfer.transfer_date,
      amount: transfer.amount,
      source_amount: transfer.source_amount ?? undefined,
      from_account: transfer.from_account,
      to_account: transfer.to_account,
      notes: transfer.notes || '',
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        transfer_date: transfer.transfer_date,
        amount: transfer.amount,
        source_amount: transfer.source_amount ?? undefined,
        from_account: transfer.from_account,
        to_account: transfer.to_account,
        notes: transfer.notes || '',
      });
    }
  }, [open, transfer, reset]);

  const fromAccount = watch('from_account');
  const toAccount = watch('to_account');
  const fromCurrency = getCurrencyForAccount(fromAccount);
  const toCurrency = getCurrencyForAccount(toAccount);
  const isCrossCurrency = fromCurrency !== toCurrency;

  const onSubmit = async (data: TransferFormData) => {
    await updateTransfer.mutateAsync({
      id: transfer.id,
      transfer_date: data.transfer_date,
      amount: data.amount,
      source_amount: isCrossCurrency ? data.source_amount ?? null : null,
      from_account: data.from_account,
      to_account: data.to_account,
      notes: data.notes || null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar transferencia</DialogTitle>
          <DialogDescription>
            Actualizá los datos de la transferencia.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cuenta origen</Label>
              <Select
                value={fromAccount}
                onValueChange={(value: AccountType) => setValue('from_account', value)}
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
              <Label>Cuenta destino</Label>
              <Select
                value={toAccount}
                onValueChange={(value: AccountType) => setValue('to_account', value)}
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
              {errors.to_account && (
                <p className="text-sm text-destructive">{errors.to_account.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfer_date">Fecha</Label>
            <Input
              id="transfer_date"
              type="date"
              {...register('transfer_date')}
            />
            {errors.transfer_date && (
              <p className="text-sm text-destructive">{errors.transfer_date.message}</p>
            )}
          </div>

          {isCrossCurrency && (
            <div className="space-y-2">
              <Label htmlFor="source_amount">Monto que sale ({fromCurrency})</Label>
              <Input
                id="source_amount"
                type="number"
                step="0.01"
                {...register('source_amount', {
                  setValueAs: (v) => (v === '' || v === null ? undefined : Number(v)),
                })}
                placeholder="0.00"
              />
              {errors.source_amount && (
                <p className="text-sm text-destructive">{errors.source_amount.message}</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="amount">
              {isCrossCurrency ? `Monto que llega (${toCurrency})` : `Monto (${fromCurrency})`}
            </Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              {...register('amount', { valueAsNumber: true })}
              placeholder="0.00"
            />
            {errors.amount && (
              <p className="text-sm text-destructive">{errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="Motivo de la transferencia..."
              rows={3}
            />
            {errors.notes && (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
