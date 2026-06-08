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
import { formatCurrency, getCurrencyForAccount } from '@/lib/utils';
import { ArrowRight } from 'lucide-react';

const transferSchema = z.object({
  transfer_date: z.string().min(1, 'La fecha es obligatoria'),
  amount: z.number().positive('El monto debe ser positivo'),
  from_account: z.enum(['bank', 'great_lodge', 'savings']),
  to_account: z.enum(['bank', 'great_lodge', 'savings']),
  notes: z.string().max(500).optional(),
}).refine(data => data.from_account !== data.to_account, {
  message: 'Las cuentas de origen y destino deben ser distintas',
  path: ['to_account'],
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

          <div className="space-y-2">
            <Label htmlFor="amount">
              Monto {isCrossCurrency ? `(${toCurrency})` : `(${fromCurrency})`}
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
            {isCrossCurrency && (
              <p className="text-xs text-muted-foreground">
                Para transferencias entre monedas, ingresá el monto de destino ({toCurrency})
              </p>
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
