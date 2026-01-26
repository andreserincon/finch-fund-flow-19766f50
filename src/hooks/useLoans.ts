import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Loan, AccountType, LoanStatus } from '@/lib/types';
import { toast } from 'sonner';

export function useLoans() {
  const queryClient = useQueryClient();

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

  const createLoan = useMutation({
    mutationFn: async (loan: {
      member_id: string;
      amount: number;
      account: AccountType;
      loan_date: string;
      notes?: string | null;
    }) => {
      // First, create the disbursement transaction (expense)
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

      // Then create the loan record with the transaction reference
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
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      toast.success('Loan created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create loan: ${error.message}`);
    },
  });

  const markLoanAsPaid = useMutation({
    mutationFn: async ({ loanId, paidDate }: { loanId: string; paidDate: string }) => {
      // Get the loan details first
      const { data: loan, error: loanFetchError } = await supabase
        .from('loans')
        .select('*')
        .eq('id', loanId)
        .single();

      if (loanFetchError) throw loanFetchError;
      if (!loan) throw new Error('Loan not found');

      // Create the repayment transaction (income)
      const { data: transaction, error: transactionError } = await supabase
        .from('transactions')
        .insert({
          transaction_date: paidDate,
          amount: loan.amount,
          transaction_type: 'income',
          category: 'loan_repayment',
          account: loan.account,
          member_id: loan.member_id,
          notes: loan.notes ? `Loan repayment: ${loan.notes}` : 'Loan repayment',
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      // Update the loan status
      const { data: updatedLoan, error: updateError } = await supabase
        .from('loans')
        .update({
          status: 'paid' as LoanStatus,
          paid_date: paidDate,
          repayment_transaction_id: transaction.id,
        })
        .eq('id', loanId)
        .select('*, member:members(id, full_name)')
        .single();

      if (updateError) throw updateError;
      return updatedLoan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      toast.success('Loan marked as paid');
    },
    onError: (error: Error) => {
      toast.error(`Failed to mark loan as paid: ${error.message}`);
    },
  });

  const cancelLoan = useMutation({
    mutationFn: async (loanId: string) => {
      // Get the loan details
      const { data: loan, error: loanFetchError } = await supabase
        .from('loans')
        .select('*')
        .eq('id', loanId)
        .single();

      if (loanFetchError) throw loanFetchError;
      if (!loan) throw new Error('Loan not found');

      // Delete the disbursement transaction if exists
      if (loan.disbursement_transaction_id) {
        const { error: deleteTransactionError } = await supabase
          .from('transactions')
          .delete()
          .eq('id', loan.disbursement_transaction_id);

        if (deleteTransactionError) throw deleteTransactionError;
      }

      // Update loan status to cancelled
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
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      toast.success('Loan cancelled');
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel loan: ${error.message}`);
    },
  });

  const deleteLoan = useMutation({
    mutationFn: async (loanId: string) => {
      // Get the loan to check for associated transactions
      const { data: loan, error: loanFetchError } = await supabase
        .from('loans')
        .select('*')
        .eq('id', loanId)
        .single();

      if (loanFetchError) throw loanFetchError;

      // Delete associated transactions
      if (loan?.disbursement_transaction_id) {
        await supabase.from('transactions').delete().eq('id', loan.disbursement_transaction_id);
      }
      if (loan?.repayment_transaction_id) {
        await supabase.from('transactions').delete().eq('id', loan.repayment_transaction_id);
      }

      // Delete the loan
      const { error } = await supabase.from('loans').delete().eq('id', loanId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loans'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
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
    markLoanAsPaid,
    cancelLoan,
    deleteLoan,
  };
}
