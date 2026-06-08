import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLoans } from '@/hooks/useLoans';
import { Loan, ACCOUNT_LABELS } from '@/lib/types';
import { formatCurrency, getCurrencyForAccount, parseLocalDate } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AlertTriangle } from 'lucide-react';

interface RevertPaidDialogProps {
  loan: Loan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RevertPaidDialog({ loan, open, onOpenChange }: RevertPaidDialogProps) {
  const { revertLoanToPending } = useLoans();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currency = getCurrencyForAccount(loan.account);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await revertLoanToPending.mutateAsync(loan.id);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Revertir a activo
          </DialogTitle>
          <DialogDescription>
            Esto deshace la acción "Marcar como pagado" y devuelve el préstamo al estado activo.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 rounded-lg bg-muted">
          <p className="font-medium">{loan.member?.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {ACCOUNT_LABELS[loan.account]} • {format(parseLocalDate(loan.loan_date), "d 'de' MMM yyyy", { locale: es })}
          </p>
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground">Monto del préstamo</p>
            <p className="text-lg font-mono font-bold">
              {formatCurrency(loan.amount, currency)}
            </p>
          </div>
        </div>

        <div className="text-sm text-muted-foreground bg-warning/10 p-3 rounded-lg">
          <p>Esta acción va a:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Eliminar el registro del pago final</li>
            <li>Quitar la transacción asociada</li>
            <li>Volver el estado del préstamo a "Activo"</li>
          </ul>
        </div>

        <div className="flex gap-3 pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            variant="destructive"
            className="flex-1"
          >
            {isSubmitting ? 'Revirtiendo...' : 'Revertir a activo'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
