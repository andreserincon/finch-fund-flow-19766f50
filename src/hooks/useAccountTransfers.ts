/**
 * @file useAccountTransfers.ts
 * @description CRUD hook for inter-account transfers (bank ↔ great_lodge ↔ savings).
 *   Transfers are standalone records separate from transactions,
 *   used to move funds between the organisation's accounts.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AccountTransfer, AccountType } from '@/lib/types';
import { toast } from 'sonner';

export function useAccountTransfers() {
  const queryClient = useQueryClient();

  /** Fetch all transfers, newest first */
  const transfersQuery = useQuery({
    queryKey: ['account_transfers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_transfers')
        .select('*')
        .order('transfer_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AccountTransfer[];
    },
  });

  /** Record a new transfer between accounts */
  const addTransfer = useMutation({
    mutationFn: async (transfer: {
      transfer_date: string;
      amount: number;
      from_account: AccountType;
      to_account: AccountType;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('account_transfers')
        .insert(transfer)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account_transfers'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      toast.success('Transferencia registrada correctamente');
    },
    onError: (error: Error) => {
      toast.error(`Error al registrar la transferencia: ${error.message}`);
    },
  });

  /** Edit an existing transfer */
  const updateTransfer = useMutation({
    mutationFn: async (transfer: {
      id: string;
      transfer_date: string;
      amount: number;
      from_account: AccountType;
      to_account: AccountType;
      notes?: string | null;
    }) => {
      const { id, ...updateData } = transfer;
      const { data, error } = await supabase
        .from('account_transfers')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account_transfers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      toast.success('Transferencia actualizada correctamente');
    },
    onError: (error: Error) => {
      toast.error(`Error al actualizar la transferencia: ${error.message}`);
    },
  });

  /** Delete a transfer */
  const deleteTransfer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('account_transfers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account_transfers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_stats'] });
      toast.success('Transferencia eliminada correctamente');
    },
    onError: (error: Error) => {
      toast.error(`Error al eliminar la transferencia: ${error.message}`);
    },
  });

  return {
    transfers: transfersQuery.data ?? [],
    isLoading: transfersQuery.isLoading,
    error: transfersQuery.error,
    addTransfer,
    updateTransfer,
    deleteTransfer,
  };
}
