/**
 * @file useGestiones.ts
 * @description Hook for the `gestiones` table: the lodge administrative
 *   periods (terms) with their start/end dates and officers (Tesorero and
 *   Venerable). Opening a new gestion closes the current open one; there is
 *   at most one open gestion at a time (enforced by a partial unique index).
 *   The open gestion's start date is the anchor for the closed-period lock
 *   (Fase 2, via the is_date_locked SQL function). Managing gestiones is an
 *   admin/vm governance action; everyone with can_view may read them.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Gestion {
  id: string;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  tesorero_member_id: string | null;
  vm_member_id: string | null;
  estado: string; // 'abierta' | 'cerrada'
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Return the ISO date (YYYY-MM-DD) one day before the given ISO date. */
function dayBefore(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function useGestiones() {
  const queryClient = useQueryClient();

  const gestionesQuery = useQuery({
    queryKey: ['gestiones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gestiones')
        .select('*')
        .order('fecha_inicio', { ascending: false });
      if (error) throw error;
      return data as Gestion[];
    },
  });

  const gestiones = gestionesQuery.data ?? [];
  const currentGestion = gestiones.find((g) => g.estado === 'abierta') ?? null;

  /**
   * Open a new gestion (the "entrega" moment). Closes the current open gestion
   * (estado cerrada, closed_at now, and fecha_fin set to the day before the new
   * start when it had none) and then inserts the new one as open. If the insert
   * fails after the previous one was closed, it reopens the previous gestion so
   * the lodge is never left without an open period.
   */
  const createGestion = useMutation({
    mutationFn: async (input: {
      nombre: string;
      fecha_inicio: string;
      tesorero_member_id: string | null;
      vm_member_id: string | null;
    }) => {
      const open = (gestionesQuery.data ?? []).find((g) => g.estado === 'abierta') ?? null;

      if (open) {
        const prevEnd = open.fecha_fin ?? dayBefore(input.fecha_inicio);
        const { error: closeErr } = await supabase
          .from('gestiones')
          .update({ estado: 'cerrada', closed_at: new Date().toISOString(), fecha_fin: prevEnd })
          .eq('id', open.id);
        if (closeErr) throw closeErr;
      }

      const { data, error } = await supabase
        .from('gestiones')
        .insert([{ ...input, estado: 'abierta' }])
        .select()
        .single();

      if (error) {
        // Compensate: reopen the previous gestion so no period is left without
        // an open gestion. Best effort; surfaces the original error either way.
        if (open) {
          await supabase
            .from('gestiones')
            .update({ estado: 'abierta', closed_at: null, fecha_fin: open.fecha_fin })
            .eq('id', open.id);
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestiones'] });
      toast.success('Gestion creada. La anterior quedo cerrada.');
    },
    onError: (error: Error) => {
      toast.error(`Error al crear la gestion: ${error.message}`);
    },
  });

  /** Edit an existing gestion (dates or officers). */
  const updateGestion = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Gestion> & { id: string }) => {
      const { data, error } = await supabase
        .from('gestiones')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestiones'] });
      toast.success('Gestion actualizada.');
    },
    onError: (error: Error) => {
      toast.error(`Error al actualizar la gestion: ${error.message}`);
    },
  });

  return {
    gestiones,
    currentGestion,
    isLoading: gestionesQuery.isLoading,
    error: gestionesQuery.error,
    createGestion,
    updateGestion,
  };
}
