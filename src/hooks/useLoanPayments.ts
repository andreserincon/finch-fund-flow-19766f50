/**
 * @file useLoanPayments.ts
 * @description Hook for viewing and managing individual payment records
 *   within a specific loan. Supports editing and deleting payments,
 *   which also updates the parent loan's running totals and linked
 *   transaction records.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/** Shape of a row in the `loan_payments` table */
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

/**
 * @param loanId - The loan whose payments to manage.
 *   Query is disabled when loanId is falsy.
 */
export function useLoanPayments(loanId: string) {
  const queryClient = useQueryClient();

  /** Fetch payments for this loan, newest first */
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

  /**
   * Update a payment's amount/date/notes.
   * Also syncs the linked transaction and recalculates the loan's
   * amount_paid / status / paid_date accordingly.
   */
  const updatePayment = useMutation({
    mutationFn: async ({
      paymentId, amount, paymentDate, notes, oldAmount, loanId, transactionId,
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

      // 1. Update the payment record
      const { error: paymentError } = await supabase
        .from('loan_payments')
        .update({ amount, payment_date: paymentDate, notes })
        .eq('id', paymentId);
      if (paymentError) throw paymentError;

      // 2. Sync the linked transaction
      if (transactionId) {
        const { error: transactionError } = await supabase
          .from('transactions')
          .update({ amount, transaction_date: paymentDate })
          .eq('id', transactionId);
        if (transactionError) throw transactionError;
      }

      // 3. Recalculate the loan's totals
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

  /**
   * Delete a payment, its linked transaction, and update the loan totals.
   */
  const deletePayment = useMutation({
    mutationFn: async ({
      paymentId, amount, loanId, transactionId,
    }: {
      paymentId: string;
      amount: number;
      loanId: string;
      transactionId: string | null;
    }) => {
      // 1. Remove the payment record
      const { error: paymentError } = await supabase
        .from('loan_payments')
        .delete()
        .eq('id', paymentId);
      if (paymentError) throw paymentError;

      // 2. Remove the linked transaction
      if (transactionId) {
        const { error: transactionError } = await supabase
          .from('transactions')
          .delete()
          .eq('id', transactionId);
        if (transactionError) throw transactionError;
      }

      // 3. Recalculate loan totals
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
