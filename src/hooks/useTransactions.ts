/**
 * @file useTransactions.ts
 * @description CRUD hook for the `transactions` table.
 *   Queries include the related member name via a join.
 *   Mutations invalidate dashboard stats and member balances
 *   so all dependent views stay fresh.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Transaction, TransactionType, TransactionCategory, AccountType } from '@/lib/types';
import { toast } from 'sonner';

export function useTransactions() {
  const queryClient = useQueryClient();

  /* ── Query: all transactions with member name ── */
  const transactionsQuery = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select(`
          *,
          member:members(id, full_name)
        `)
        .order('transaction_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as (Transaction & { member: { id: string; full_name: string } | null })[];
    },
  });

  /** Invalidate all caches that depend on transaction data */
  const invalidateRelated = () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['member_balances'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
    queryClient.invalidateQueries({ queryKey: ['loans'] });
    queryClient.invalidateQueries({ queryKey: ['loan_payments'] });
  };

  /* ── Mutation: create a new transaction ── */
  const addTransaction = useMutation({
    mutationFn: async (transaction: {
      transaction_date: string;
      amount: number;
      transaction_type: TransactionType;
      category: TransactionCategory;
      member_id?: string | null;
      notes?: string | null;
      account?: AccountType;
    }) => {
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          ...transaction,
          account: transaction.account || 'bank',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Transaction recorded successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to record transaction: ${error.message}`);
    },
  });

  /* ── Mutation: update an existing transaction ── */
  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Transaction> & { id: string }) => {
      const { data, error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Transaction updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update transaction: ${error.message}`);
    },
  });

  /* ── Mutation: delete a transaction ── */
  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Transaction deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete transaction: ${error.message}`);
    },
  });

  return {
    transactions: transactionsQuery.data ?? [],
    isLoading: transactionsQuery.isLoading,
    error: transactionsQuery.error,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
