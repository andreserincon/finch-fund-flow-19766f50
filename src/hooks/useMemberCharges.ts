/**
 * @file useMemberCharges.ts
 * @description Hook for member charges (cuentas por cobrar). Lists charges with
 *   the member name, creates charges, registers payments (which also post an
 *   income transaction and let the DB trigger recompute amount_paid/status),
 *   and cancels charges. The new tables are not in the generated Supabase types
 *   yet, so the client is used untyped (cast) here.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MemberCharge, ChargeCategory, ChargeCurrency } from '@/lib/cobros-types';
import { CHARGE_CATEGORY_LABELS } from '@/lib/cobros-types';
import type { AccountType } from '@/lib/types';

// member_charges / member_charge_payments are not in the generated types yet.
const db = supabase as unknown as {
  from: (t: string) => any;
};

export function useMemberCharges() {
  const queryClient = useQueryClient();

  const chargesQuery = useQuery({
    queryKey: ['member-charges'],
    queryFn: async (): Promise<MemberCharge[]> => {
      const { data, error } = await db
        .from('member_charges')
        .select('*, member:members(full_name)')
        .order('charge_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as MemberCharge[];
    },
  });

  const createCharge = useMutation({
    mutationFn: async (input: {
      member_id: string;
      category: ChargeCategory;
      note?: string;
      amount: number;
      currency: ChargeCurrency;
      charge_date: string;
    }) => {
      const { error } = await db.from('member_charges').insert({
        member_id: input.member_id,
        category: input.category,
        note: input.note?.trim() || null,
        amount: input.amount,
        currency: input.currency,
        charge_date: input.charge_date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-charges'] });
      toast.success('Cargo registrado');
    },
    onError: () => toast.error('No se pudo registrar el cargo'),
  });

  const registerPayment = useMutation({
    mutationFn: async (input: {
      charge: MemberCharge;
      amount: number;
      account: AccountType;
      payment_date: string;
    }) => {
      const { charge, amount, account, payment_date } = input;
      const label = CHARGE_CATEGORY_LABELS[charge.category];
      const notes = `Cobro: ${label}${charge.note ? ' - ' + charge.note : ''}`;

      // 1. Post the income transaction.
      const { data: tx, error: txError } = await db
        .from('transactions')
        .insert({
          transaction_date: payment_date,
          amount,
          transaction_type: 'income',
          category: 'other_income',
          member_id: charge.member_id,
          account,
          notes,
        })
        .select('id')
        .single();
      if (txError) throw txError;

      // 2. Record the payment; a DB trigger recomputes amount_paid/status.
      const { error: payError } = await db.from('member_charge_payments').insert({
        charge_id: charge.id,
        amount,
        payment_date,
        transaction_id: tx.id,
      });
      if (payError) throw payError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-charges'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success('Cobro registrado');
    },
    onError: () => toast.error('No se pudo registrar el cobro'),
  });

  const updateCharge = useMutation({
    mutationFn: async (input: {
      charge: MemberCharge;
      member_id: string;
      category: ChargeCategory;
      note?: string;
      amount: number;
      currency: ChargeCurrency;
      charge_date: string;
    }) => {
      const { charge } = input;
      const paid = Number(charge.amount_paid);
      // El monto nuevo puede cambiar el estado; lo recalculamos (no hay trigger
      // de recalculo sobre member_charges al editar el monto).
      const status = paid >= input.amount ? 'paid' : paid > 0 ? 'partial' : 'pending';
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await db.from('member_charges').update({
        member_id: input.member_id,
        category: input.category,
        note: input.note?.trim() || null,
        amount: input.amount,
        currency: input.currency,
        charge_date: input.charge_date,
        status,
        paid_date: status === 'paid' ? (charge.paid_date ?? today) : null,
      }).eq('id', charge.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-charges'] });
      toast.success('Cargo actualizado');
    },
    onError: () => toast.error('No se pudo actualizar el cargo'),
  });

  const cancelCharge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db
        .from('member_charges')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-charges'] });
      toast.success('Cargo anulado');
    },
    onError: () => toast.error('No se pudo anular el cargo'),
  });

  return {
    charges: chargesQuery.data ?? [],
    isLoading: chargesQuery.isLoading,
    error: chargesQuery.error,
    createCharge,
    updateCharge,
    registerPayment,
    cancelCharge,
  };
}
