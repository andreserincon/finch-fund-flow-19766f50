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
import { useLoans } from '@/hooks/useLoans';
import { useMembers } from '@/hooks/useMembers';
import { AccountType } from '@/lib/types';
import { getCurrencyForAccount } from '@/lib/utils';

const loanSchema = z.object({
  member_id: z.string().min(1, 'El miembro es obligatorio'),
  amount: z.number().positive('El monto debe ser positivo'),
  account: z.enum(['bank', 'savings']),
  loan_date: z.string().min(1, 'La fecha es obligatoria'),
  notes: z.string().max(500).optional(),
});

type LoanFormData = z.infer<typeof loanSchema>;

interface AddLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddLoanDialog({ open, onOpenChange }: AddLoanDialogProps) {
  const { createLoan } = useLoans();
  const { members } = useMembers();

  const activeMembers = members.filter((m) => m.is_active);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LoanFormData>({
    resolver: zodResolver(loanSchema),
    defaultValues: {
      loan_date: new Date().toISOString().split('T')[0],
      account: 'bank',
    },
  });

  const selectedAccount = watch('account');
  const currency = getCurrencyForAccount(selectedAccount);

  const onSubmit = async (data: LoanFormData) => {
    await createLoan.mutateAsync({
      member_id: data.member_id,
      amount: data.amount,
      account: data.account as AccountType,
      loan_date: data.loan_date,
      notes: data.notes || null,
    });
    reset();
    onOpenChange(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nuevo Préstamo</DialogTitle>
          <DialogDescription>
            Creá un préstamo para un socio. El monto se descuenta de la cuenta seleccionada.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>Miembro</Label>
            <Select onValueChange={(value) => setValue('member_id', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar miembro" />
              </SelectTrigger>
              <SelectContent>
                {activeMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.member_id && (
              <p className="text-sm text-destructive">{errors.member_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cuenta</Label>
              <Select
                value={selectedAccount}
                onValueChange={(value: 'bank' | 'savings') => setValue('account', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Cuenta Bancaria Principal (ARS)</SelectItem>
                  <SelectItem value="savings">Caja de Ahorro (USD)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loan_date">Fecha</Label>
              <Input
                id="loan_date"
                type="date"
                {...register('loan_date')}
              />
              {errors.loan_date && (
                <p className="text-sm text-destructive">{errors.loan_date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Monto ({currency})</Label>
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
              placeholder="Motivo del préstamo..."
              rows={3}
            />
            {errors.notes && (
              <p className="text-sm text-destructive">{errors.notes.message}</p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1">
              {isSubmitting ? 'Creando...' : 'Crear préstamo'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
