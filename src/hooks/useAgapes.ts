/**
 * @file useAgapes.ts
 * @description Hook del modulo de agapes (comidas entre hermanos donde uno
 *   recauda). Lista el agape ABIERTO con sus comensales, crea un agape nuevo con
 *   su reparto, marca/desmarca pagos (aplicando el descuento por efectivo) y
 *   cierra el agape. Las tablas agapes / agape_participants todavia no estan en
 *   los generated types, asi que el cliente se usa sin tipar (cast), igual que en
 *   useMemberCharges.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  computePayment, splitEqual,
  type Agape, type AgapeParticipant, type AgapePaymentMethod, type AgapeSplitMode,
} from '@/lib/agape-types';

// agapes / agape_participants no estan en los generated types todavia.
const db = supabase as unknown as { from: (t: string) => any };

/** Un comensal a crear: un hermano del padron o un invitado por texto libre. */
export interface NewParticipant {
  member_id: string | null;
  guest_name: string | null;
}

export interface NewAgapeInput {
  title: string;
  agape_date: string;
  total_amount: number;
  tip_amount: number;
  cash_discount_pct: number;
  participants: NewParticipant[];
}

export function useAgapes() {
  const queryClient = useQueryClient();

  // El agape abierto (uno a la vez; no se guarda historial navegable).
  const agapeQuery = useQuery({
    queryKey: ['agape-open'],
    // Sin reintentos: si la tabla todavia no existe (o cualquier error), la
    // pantalla cae al estado vacio en vez de quedar cargando para siempre.
    retry: false,
    queryFn: async (): Promise<Agape | null> => {
      const { data, error } = await db
        .from('agapes')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Agape | null;
    },
  });

  const agape = agapeQuery.data ?? null;

  const participantsQuery = useQuery({
    queryKey: ['agape-participants', agape?.id],
    enabled: !!agape?.id,
    retry: false,
    queryFn: async (): Promise<AgapeParticipant[]> => {
      const { data, error } = await db
        .from('agape_participants')
        .select('*, member:members(full_name)')
        .eq('agape_id', agape!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgapeParticipant[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['agape-open'] });
    queryClient.invalidateQueries({ queryKey: ['agape-participants'] });
  };

  const createAgape = useMutation({
    mutationFn: async (input: NewAgapeInput) => {
      const objetivo = Number(input.total_amount) + Number(input.tip_amount);
      const shares = splitEqual(objetivo, input.participants.length);
      const { data: ag, error: agErr } = await db
        .from('agapes')
        .insert({
          title: input.title.trim(),
          agape_date: input.agape_date,
          total_amount: input.total_amount,
          tip_amount: input.tip_amount,
          cash_discount_pct: input.cash_discount_pct,
          split_mode: 'equal' as AgapeSplitMode,
          status: 'open',
        })
        .select('id')
        .single();
      if (agErr) throw agErr;

      const rows = input.participants.map((p, i) => ({
        agape_id: ag.id,
        member_id: p.member_id,
        guest_name: p.member_id ? null : (p.guest_name?.trim() || null),
        share_amount: shares[i] ?? 0,
      }));
      if (rows.length > 0) {
        const { error: pErr } = await db.from('agape_participants').insert(rows);
        if (pErr) throw pErr;
      }
    },
    onSuccess: () => { invalidate(); toast.success('Ágape creado'); },
    onError: () => toast.error('No se pudo crear el ágape'),
  });

  const markPaid = useMutation({
    mutationFn: async (input: { participant: AgapeParticipant; method: AgapePaymentMethod }) => {
      const pct = Number(agape?.cash_discount_pct ?? 0);
      const { discountApplied, amountPaid } = computePayment(Number(input.participant.share_amount), input.method, pct);
      const { error } = await db
        .from('agape_participants')
        .update({
          paid: true,
          payment_method: input.method,
          discount_applied: discountApplied,
          amount_paid: amountPaid,
          paid_at: new Date().toISOString(),
        })
        .eq('id', input.participant.id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: () => toast.error('No se pudo registrar el pago'),
  });

  const undoPaid = useMutation({
    mutationFn: async (participantId: string) => {
      const { error } = await db
        .from('agape_participants')
        .update({ paid: false, payment_method: null, discount_applied: 0, amount_paid: 0, paid_at: null })
        .eq('id', participantId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: () => toast.error('No se pudo deshacer el pago'),
  });

  // Ajustar la parte de un comensal (el que comio distinto). No toca a los demas.
  const updateShare = useMutation({
    mutationFn: async (input: { participantId: string; share: number }) => {
      const { error } = await db
        .from('agape_participants')
        .update({ share_amount: input.share })
        .eq('id', input.participantId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: () => toast.error('No se pudo ajustar la parte'),
  });

  // Volver a repartir el objetivo en partes iguales entre todos.
  const redistributeEqual = useMutation({
    mutationFn: async (parts: AgapeParticipant[]) => {
      if (!agape) return;
      const objetivo = Number(agape.total_amount) + Number(agape.tip_amount);
      const shares = splitEqual(objetivo, parts.length);
      await Promise.all(parts.map((p, i) =>
        db.from('agape_participants').update({ share_amount: shares[i] ?? 0 }).eq('id', p.id)
      ));
    },
    onSuccess: () => { invalidate(); toast.success('Repartido en partes iguales'); },
    onError: () => toast.error('No se pudo repartir'),
  });

  const closeAgape = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from('agapes').update({ status: 'closed' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Ágape cerrado'); },
    onError: () => toast.error('No se pudo cerrar el ágape'),
  });

  return {
    agape,
    participants: participantsQuery.data ?? [],
    isLoading: agapeQuery.isLoading || (!!agape && participantsQuery.isLoading),
    createAgape,
    markPaid,
    undoPaid,
    updateShare,
    redistributeEqual,
    closeAgape,
  };
}
