import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LoanPayment {
  id: string;
  loan_id: string;
  amount: number;
  payment_date: string;
  transaction_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useLoanPayments(loanId: string) {
  const queryClient = useQueryClient();

  const paymentsQuery = useQuery({
    queryKey: ['loan-payments', loanId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loan_payments')
        .select('*')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as LoanPayment[];
    },
    enabled: !!loanId,
  });

  const updatePayment = useMutation({
    mutationFn: async ({
      paymentId,
      amount,
      paymentDate,
      notes,
      oldAmount,
      loanId,
      transactionId,
    }: {
      paymentId: string;
      amount: number;
      paymentDate: string;
      notes?: string | null;
      oldAmount: number;
      loanId: string;
      transactionId: string | null;
    }) => {
      const amountDiff = amount - oldAmount;

      // Update the payment record
      const { error: paymentError } = await supabase
        .from('loan_payments')
        .update({
          amount,
          payment_date: paymentDate,
          notes,
        })
        .eq('id', paymentId);

      if (paymentError) throw paymentError;

      // Update the associated transaction if exists
      if (transactionId) {
        const { error: transactionError } = await supabase
          .from('transactions')
          .update({
            amount,
            transaction_date: paymentDate,
          })
          .eq('id', transactionId);

        if (transactionError) throw transactionError;
      }

      // Update loan's amount_paid
      const { data: loan, error: loanFetchError } = await supabase
        .from('loans')
        .select('amount, amount_paid')
        .eq('id', loanId)
        .single();

      if (loanFetchError) throw loanFetchError;

      const newAmountPaid = loan.amount_paid + amountDiff;
      const isFullyPaid = newAmountPaid >= loan.amount;

      const { error: loanUpdateError } = await supabase
        .from('loans')
        .update({
          amount_paid: newAmountPaid,
          status: isFullyPaid ? 'paid' : 'active',
          paid_date: isFullyPaid ? paymentDate : null,
        })
        .eq('id', loanId);

      if (loanUpdateError) throw loanUpdateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-payments', loanId] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Payment updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update payment: ${error.message}`);
    },
  });

  const deletePayment = useMutation({
    mutationFn: async ({
      paymentId,
      amount,
      loanId,
      transactionId,
    }: {
      paymentId: string;
      amount: number;
      loanId: string;
      transactionId: string | null;
    }) => {
      // Delete the payment record
      const { error: paymentError } = await supabase
        .from('loan_payments')
        .delete()
        .eq('id', paymentId);

      if (paymentError) throw paymentError;

      // Delete the associated transaction if exists
      if (transactionId) {
        const { error: transactionError } = await supabase
          .from('transactions')
          .delete()
          .eq('id', transactionId);

        if (transactionError) throw transactionError;
      }

      // Update loan's amount_paid
      const { data: loan, error: loanFetchError } = await supabase
        .from('loans')
        .select('amount, amount_paid')
        .eq('id', loanId)
        .single();

      if (loanFetchError) throw loanFetchError;

      const newAmountPaid = Math.max(0, loan.amount_paid - amount);
      const isFullyPaid = newAmountPaid >= loan.amount;

      const { error: loanUpdateError } = await supabase
        .from('loans')
        .update({
          amount_paid: newAmountPaid,
          status: isFullyPaid ? 'paid' : 'active',
          paid_date: isFullyPaid ? new Date().toISOString().split('T')[0] : null,
        })
        .eq('id', loanId);

      if (loanUpdateError) throw loanUpdateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loan-payments', loanId] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Payment deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete payment: ${error.message}`);
    },
  });

  return {
    payments: paymentsQuery.data ?? [],
    isLoading: paymentsQuery.isLoading,
    error: paymentsQuery.error,
    updatePayment,
    deletePayment,
  };
}
