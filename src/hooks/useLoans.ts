/**
 * @file useLoans.ts
 * @description Full lifecycle management for member loans.
 *
 * Key operations:
 *   - createLoan      → creates a loan + disbursement expense transaction
 *   - addLoanPayment  → records a partial repayment + income transaction
 *   - markLoanAsPaid  → pays remaining balance in full
 *   - revertLoanToPending → undo the last full-pay, returning loan to active
 *   - cancelLoan      → cancel and delete the disbursement transaction
 *   - deleteLoan      → hard-delete loan + associated transactions
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loan, AccountType, LoanStatus } from '@/lib/types';
import { toast } from 'sonner';

export function useLoans() {
  const queryClient = useQueryClient();

  /** Invalidate all loan-related caches */
  const invalidateRelated = () => {
    queryClient.invalidateQueries({ queryKey: ['loans'] });
    queryClient.invalidateQueries({ queryKey: ['loan-payments'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
  };

  /* ── Query: all loans with member names ── */
  const loansQuery = useQuery({
    queryKey: ['loans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('loans')
        .select('*, member:members(id, full_name)')
        .order('loan_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Loan[];
    },
  });

  /* ── Mutation: create a new loan ── */
  const createLoan = useMutation({
    mutationFn: async (loan: {
      member_id: string;
      amount: number;
      account: AccountType;
      loan_date: string;
      notes?: string | null;
    }) => {
      // Step 1: create the disbursement transaction (expense)
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert({
          transaction_date: loan.loan_date,
          amount: loan.amount,
          transaction_type: 'expense',
          category: 'loan_disbursement',
          account: loan.account,
          member_id: loan.member_id,
          notes: loan.notes ? `Loan: ${loan.notes}` : 'Loan disbursement',
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      // Step 2: create the loan record linked to the transaction
      const { data: loanData, error: loanError } = await supabase
        .from('loans')
        .insert({
          member_id: loan.member_id,
          amount: loan.amount,
          account: loan.account,
          loan_date: loan.loan_date,
          notes: loan.notes || null,
          disbursement_transaction_id: transaction.id,
        })
        .select('*, member:members(id, full_name)')
        .single();

      if (loanError) throw loanError;
      return loanData;
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Loan created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create loan: ${error.message}`);
    },
  });

  /* ── Mutation: record a partial loan repayment ── */
  const addLoanPayment = useMutation({
    mutationFn: async ({
      loanId,
      paymentAmount,
      paymentDate,
    }: {
      loanId: string;
      paymentAmount: number;
      paymentDate: string;
    }) => {
      // Fetch current loan state
      const { data: loan, error: loanFetchError } = await supabase
        .from('loans')
        .select('*')
        .eq('id', loanId)
        .single();

      if (loanFetchError) throw loanFetchError;
      if (!loan) throw new Error('Loan not found');

      // Validate amount
      const remainingDue = loan.amount - loan.amount_paid;
      if (paymentAmount > remainingDue) {
        throw new Error(`Payment amount cannot exceed remaining balance of ${remainingDue}`);
      }

      // Create the repayment income transaction
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert({
          transaction_date: paymentDate,
          amount: paymentAmount,
          transaction_type: 'income',
          category: 'loan_repayment',
          account: loan.account,
          member_id: loan.member_id,
          notes: loan.notes ? `Loan repayment: ${loan.notes}` : 'Loan repayment',
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      // Record the loan_payment entry
      const { error: paymentError } = await supabase
        .from('loan_payments')
        .insert({
          loan_id: loanId,
          amount: paymentAmount,
          payment_date: paymentDate,
          transaction_id: transaction.id,
        });

      if (paymentError) throw paymentError;

      // Update running total on the loan
      const newAmountPaid = loan.amount_paid + paymentAmount;
      const isFullyPaid = newAmountPaid >= loan.amount;

      const { data: updatedLoan, error: updateError } = await supabase
        .from('loans')
        .update({
          amount_paid: newAmountPaid,
          status: isFullyPaid ? ('paid' as LoanStatus) : ('active' as LoanStatus),
          paid_date: isFullyPaid ? paymentDate : null,
        })
        .eq('id', loanId)
        .select('*, member:members(id, full_name)')
        .single();

      if (updateError) throw updateError;
      return updatedLoan;
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Payment recorded successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to record payment: ${error.message}`);
    },
  });

  /* ── Mutation: mark loan as fully paid ── */
  const markLoanAsPaid = useMutation({
    mutationFn: async ({ loanId, paidDate }: { loanId: string; paidDate: string }) => {
      const { data: loan, error: loanFetchError } = await supabase
        .from('loans')
        .select('*')
        .eq('id', loanId)
        .single();

      if (loanFetchError) throw loanFetchError;
      if (!loan) throw new Error('Loan not found');

      const remainingDue = loan.amount - loan.amount_paid;

      // Create final repayment transaction for the remaining balance
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert({
          transaction_date: paidDate,
          amount: remainingDue,
          transaction_type: 'income',
          category: 'loan_repayment',
          account: loan.account,
          member_id: loan.member_id,
          notes: loan.notes ? `Loan repayment (full): ${loan.notes}` : 'Loan repayment (full)',
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      // Record the payment entry
      const { error: paymentError } = await supabase
        .from('loan_payments')
        .insert({
          loan_id: loanId,
          amount: remainingDue,
          payment_date: paidDate,
          transaction_id: transaction.id,
          notes: 'Full payment',
        });

      if (paymentError) throw paymentError;

      // Mark loan as paid
      const { data: updatedLoan, error: updateError } = await supabase
        .from('loans')
        .update({
          status: 'paid' as LoanStatus,
          paid_date: paidDate,
          amount_paid: loan.amount,
          repayment_transaction_id: transaction.id,
        })
        .eq('id', loanId)
        .select('*, member:members(id, full_name)')
        .single();

      if (updateError) throw updateError;
      return updatedLoan;
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Loan marked as fully paid');
    },
    onError: (error: Error) => {
      toast.error(`Failed to mark loan as paid: ${error.message}`);
    },
  });

  /* ── Mutation: revert a paid loan back to active ── */
  const revertLoanToPending = useMutation({
    mutationFn: async (loanId: string) => {
      const { data: loan, error: loanFetchError } = await supabase
        .from('loans')
        .select('*')
        .eq('id', loanId)
        .single();

      if (loanFetchError) throw loanFetchError;
      if (!loan) throw new Error('Loan not found');
      if (loan.status !== 'paid') throw new Error('Loan is not in paid status');

      // Find the most recent payment (the one that finalised the loan)
      const { data: lastPayment, error: paymentFetchError } = await supabase
        .from('loan_payments')
        .select('*')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (paymentFetchError) throw paymentFetchError;
      if (!lastPayment) throw new Error('No payment record found to revert');

      const newAmountPaid = Math.max(0, loan.amount_paid - lastPayment.amount);

      // Clear FK references and revert status
      const { error: loanUpdateError } = await supabase
        .from('loans')
        .update({
          status: 'active' as LoanStatus,
          paid_date: null,
          amount_paid: newAmountPaid,
          repayment_transaction_id: null,
        })
        .eq('id', loanId);

      if (loanUpdateError) throw loanUpdateError;

      // Delete the payment record
      const { error: paymentDeleteError } = await supabase
        .from('loan_payments')
        .delete()
        .eq('id', lastPayment.id);

      if (paymentDeleteError) throw paymentDeleteError;

      // Delete the associated transaction
      if (lastPayment.transaction_id) {
        const { error: transactionError } = await supabase
          .from('transactions')
          .delete()
          .eq('id', lastPayment.transaction_id);

        if (transactionError) throw transactionError;
      }

      // Return the updated loan
      const { data: updatedLoan, error: fetchError } = await supabase
        .from('loans')
        .select('*, member:members(id, full_name)')
        .eq('id', loanId)
        .single();

      if (fetchError) throw fetchError;
      return updatedLoan;
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Loan reverted to active status');
    },
    onError: (error: Error) => {
      toast.error(`Failed to revert loan: ${error.message}`);
    },
  });

  /* ── Mutation: cancel a loan (delete disbursement, mark cancelled) ── */
  const cancelLoan = useMutation({
    mutationFn: async (loanId: string) => {
      const { data: loan, error: loanFetchError } = await supabase
        .from('loans')
        .select('*')
        .eq('id', loanId)
        .single();

      if (loanFetchError) throw loanFetchError;
      if (!loan) throw new Error('Loan not found');

      // Remove the disbursement transaction
      if (loan.disbursement_transaction_id) {
        const { error: deleteTransactionError } = await supabase
          .from('transactions')
          .delete()
          .eq('id', loan.disbursement_transaction_id);
        if (deleteTransactionError) throw deleteTransactionError;
      }

      // Set status to cancelled
      const { data: updatedLoan, error: updateError } = await supabase
        .from('loans')
        .update({
          status: 'cancelled' as LoanStatus,
          disbursement_transaction_id: null,
        })
        .eq('id', loanId)
        .select('*, member:members(id, full_name)')
        .single();

      if (updateError) throw updateError;
      return updatedLoan;
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Loan cancelled');
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel loan: ${error.message}`);
    },
  });

  /* ── Mutation: hard-delete a loan and its transactions ── */
  const deleteLoan = useMutation({
    mutationFn: async (loanId: string) => {
      const { data: loan, error: loanFetchError } = await supabase
        .from('loans')
        .select('*')
        .eq('id', loanId)
        .single();

      if (loanFetchError) throw loanFetchError;

      // Clean up linked transactions
      if (loan?.disbursement_transaction_id) {
        await supabase.from('transactions').delete().eq('id', loan.disbursement_transaction_id);
      }
      if (loan?.repayment_transaction_id) {
        await supabase.from('transactions').delete().eq('id', loan.repayment_transaction_id);
      }

      const { error } = await supabase.from('loans').delete().eq('id', loanId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Loan deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete loan: ${error.message}`);
    },
  });

  return {
    loans: loansQuery.data ?? [],
    isLoading: loansQuery.isLoading,
    error: loansQuery.error,
    createLoan,
    addLoanPayment,
    markLoanAsPaid,
    revertLoanToPending,
    cancelLoan,
    deleteLoan,
  };
}
