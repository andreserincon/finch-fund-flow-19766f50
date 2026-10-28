/**
 * @file useMedalInventory.ts
 * @description Hook for the medal inventory (single type). Reads current stock
 *   from the medal_stock view, lists movements, registers stock entries, and
 *   delivers medals. A delivery "con cargo" creates a linked member_charge in
 *   the same step; "iniciacion" is a plain out movement. Tables are not in the
 *   generated Supabase types yet, so the client is used untyped (cast).
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MedalMovement, MedalMovementReason } from '@/lib/medallas-types';
import type { ChargeCurrency } from '@/lib/cobros-types';

const db = supabase as unknown as { from: (t: string) => any };

export function useMedalInventory() {
  const queryClient = useQueryClient();

  const stockQuery = useQuery({
    queryKey: ['medal-stock'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await db.from('medal_stock').select('stock').maybeSingle();
      if (error) throw error;
      return Number(data?.stock ?? 0);
    },
  });

  const movementsQuery = useQuery({
    queryKey: ['medal-movements'],
    queryFn: async (): Promise<MedalMovement[]> => {
      const { data, error } = await db
        .from('medal_inventory_movements')
        .select('*, member:members(full_name)')
        .order('movement_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as MedalMovement[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['medal-stock'] });
    queryClient.invalidateQueries({ queryKey: ['medal-movements'] });
  };

  const addStock = useMutation({
    mutationFn: async (input: {
      quantity: number;
      movement_date: string;
      reason: Extract<MedalMovementReason, 'compra' | 'ajuste_entrada'>;
      note?: string;
    }) => {
      const { error } = await db.from('medal_inventory_movements').insert({
        movement_type: 'in',
        quantity: input.quantity,
        movement_date: input.movement_date,
        reason: input.reason,
        note: input.note?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Entrada registrada'); },
    onError: () => toast.error('No se pudo registrar la entrada'),
  });

  const deliver = useMutation({
    mutationFn: async (input: {
      member_id: string;
      movement_date: string;
      withCharge: boolean;
      amount?: number;
      currency?: ChargeCurrency;
      note?: string;
    }) => {
      let chargeId: string | null = null;

      if (input.withCharge) {
        if (!input.amount || input.amount <= 0) throw new Error('Monto inválido');
        const { data: charge, error: chargeError } = await db
          .from('member_charges')
          .insert({
            member_id: input.member_id,
            category: 'medalla',
            amount: input.amount,
            currency: input.currency ?? 'ARS',
            charge_date: input.movement_date,
            note: input.note?.trim() || 'Medalla',
          })
          .select('id')
          .single();
        if (chargeError) throw chargeError;
        chargeId = charge.id;
      }

      const { error: moveError } = await db.from('medal_inventory_movements').insert({
        movement_type: 'out',
        quantity: 1,
        movement_date: input.movement_date,
        member_id: input.member_id,
        reason: input.withCharge ? 'entrega_con_cargo' : 'iniciacion',
        charge_id: chargeId,
        note: input.note?.trim() || null,
      });
      if (moveError) throw moveError;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['member-charges'] });
      toast.success('Medalla entregada');
    },
    onError: (e) => toast.error(e instanceof Error && e.message === 'Monto inválido'
      ? 'Ingresá un monto válido'
      : 'No se pudo registrar la entrega'),
  });

  return {
    stock: stockQuery.data ?? 0,
    movements: movementsQuery.data ?? [],
    isLoading: stockQuery.isLoading || movementsQuery.isLoading,
    addStock,
    deliver,
  };
}
