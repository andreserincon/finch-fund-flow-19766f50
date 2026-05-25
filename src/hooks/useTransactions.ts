/**
 * @file useTransactions.ts
 * @description CRUD hook for the `transactions` table.
 *   Queries include the related member name via a join.
 *   Mutations invalidate dashboard stats and member balances
 *   so all dependent views stay fresh.
 *
 *   When a mutation touches an event_member_payment_id (either the row
 *   being created/updated/deleted, or the previous row's link if it
 *   moved), we recompute the corresponding event_member_payments.
 *   amount_paid as the sum of related event_payment transactions.
 *   This keeps the participant's "Pagado" state in sync with cash flow
 *   without requiring a database trigger.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Transaction, TransactionType, TransactionCategory, AccountType } from '@/lib/types';
import { toast } from 'sonner';

/**
 * Recompute amount_paid for a single event_member_payment row by
 * summing all event_payment transactions that point at it. Treat as a
 * canonical reconciliation — overrides any previously stored value.
 */
async function recomputeAmountPaid(eventMemberPaymentId: string | null | undefined) {
  if (!eventMemberPaymentId) return;
  const { data, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('event_member_payment_id', eventMemberPaymentId)
    .eq('transaction_type', 'income')
    .eq('category', 'event_payment');

  if (error) {
    console.warn('Failed to read transactions for amount_paid recompute', error);
    return;
  }

  const total = (data ?? []).reduce((s, t) => s + Number(t.amount), 0);

  const { error: updateError } = await supabase
    .from('event_member_payments')
    .update({ amount_paid: total })
    .eq('id', eventMemberPaymentId);

  if (updateError) {
    console.warn('Failed to update event_member_payments.amount_paid', updateError);
  }
}

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
    queryClient.invalidateQueries({ queryKey: ['event-member-payments'] });
    queryClient.invalidateQueries({ queryKey: ['event-overview'] });
  };

  /* ── Mutation: create a new transaction ── */
  const addTransaction = useMutation({
    mutationFn: async (transaction: {
      transaction_date: string;
      amount: number;
      transaction_type: TransactionType;
      category: TransactionCategory;
      member_id?: string | null;
      event_id?: string | null;
      event_member_payment_id?: string | null;
      event_summary?: string | null;
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
      await recomputeAmountPaid(transaction.event_member_payment_id);
      return data;
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Transacción registrada correctamente');
    },
    onError: (error: Error) => {
      toast.error(`Error al registrar transacción: ${error.message}`);
    },
  });

  /* ── Mutation: update an existing transaction ── */
  const updateTransaction = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Transaction> & { id: string }) => {
      // Capture the old event_member_payment_id so we can recompute the
      // PREVIOUS row if the link is changing.
      const { data: prior } = await supabase
        .from('transactions')
        .select('event_member_payment_id')
        .eq('id', id)
        .maybeSingle();

      const { data, error } = await supabase
        .from('transactions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      const prevLink = prior?.event_member_payment_id ?? null;
      const newLink = (data as Transaction).event_member_payment_id ?? null;

      await recomputeAmountPaid(newLink);
      if (prevLink && prevLink !== newLink) {
        await recomputeAmountPaid(prevLink);
      }
      return data;
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Transacción actualizada correctamente');
    },
    onError: (error: Error) => {
      toast.error(`Error al actualizar transacción: ${error.message}`);
    },
  });

  /* ── Mutation: delete a transaction ── */
  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { data: prior } = await supabase
        .from('transactions')
        .select('event_member_payment_id')
        .eq('id', id)
        .maybeSingle();

      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;

      await recomputeAmountPaid(prior?.event_member_payment_id ?? null);
    },
    onSuccess: () => {
      invalidateRelated();
      toast.success('Transacción eliminada correctamente');
    },
    onError: (error: Error) => {
      toast.error(`Error al eliminar transacción: ${error.message}`);
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
