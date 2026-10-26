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

interface UserRoleRow {
  user_id: string;
  member_id: string | null;
  role: string | null;
}

interface OfficerUser {
  user_id: string;
  member_id: string | null;
  roles: string[];
}

/**
 * Make the app roles match a gestion's officers. A user may hold more than one
 * role, so the office role is ADDED to / REMOVED from the user's role set
 * (through the admin-update-user edge function, authz admin|vm) without touching
 * their other roles. The incoming Tesorero gets `treasurer` and the Venerable
 * gets `vm`; the outgoing officers lose that office role (and fall back to
 * `member` when it was their only role). A member must have a user account to
 * receive a role. Best effort: returns a Spanish warning per step that failed.
 */
async function reconcileGestionRoles(params: {
  newTesoreroMemberId: string | null;
  newVmMemberId: string | null;
  prevTesoreroMemberId: string | null;
  prevVmMemberId: string | null;
}): Promise<string[]> {
  const warnings: string[] = [];

  const { data, error } = await supabase.rpc('get_users_with_roles');
  if (error) {
    warnings.push('No se pudieron leer los usuarios para asignar los roles.');
    return warnings;
  }
  // Group the one-row-per-role result into one entry per user with a roles array.
  const byUser = new Map<string, OfficerUser>();
  for (const r of (data ?? []) as UserRoleRow[]) {
    const u = byUser.get(r.user_id);
    if (u) {
      if (r.role && !u.roles.includes(r.role)) u.roles.push(r.role);
    } else {
      byUser.set(r.user_id, { user_id: r.user_id, member_id: r.member_id, roles: r.role ? [r.role] : [] });
    }
  }
  const users = Array.from(byUser.values());
  const userForMember = (mid: string | null) =>
    mid ? users.find((u) => u.member_id === mid) ?? null : null;

  const setRoles = async (userId: string, newRoles: string[], memberId: string) => {
    const { data: res, error: err } = await supabase.functions.invoke('admin-update-user', {
      body: { userId, roles: newRoles, memberId },
    });
    if (err) throw new Error(err.message);
    if (res?.error) throw new Error(res.error);
  };

  // Agregar el rol de oficina a los entrantes, conservando sus otros roles.
  const incoming: Array<[string | null, 'treasurer' | 'vm']> = [
    [params.newTesoreroMemberId, 'treasurer'],
    [params.newVmMemberId, 'vm'],
  ];
  for (const [mid, role] of incoming) {
    if (!mid) continue;
    const u = userForMember(mid);
    if (!u) {
      warnings.push('Un oficial elegido no tiene usuario; no se le asigno el rol.');
      continue;
    }
    if (u.roles.includes(role)) continue; // ya lo tiene
    try {
      await setRoles(u.user_id, [...u.roles, role], mid);
    } catch {
      warnings.push('No se pudo asignar el rol a un oficial entrante.');
    }
  }

  // Quitar el rol de oficina a los salientes que ya no siguen (conservando sus
  // otros roles; si era el unico, quedan como Miembro).
  const outgoing: Array<[string | null, 'treasurer' | 'vm', string | null]> = [
    [params.prevTesoreroMemberId, 'treasurer', params.newTesoreroMemberId],
    [params.prevVmMemberId, 'vm', params.newVmMemberId],
  ];
  for (const [prevMid, role, newMid] of outgoing) {
    if (!prevMid || prevMid === newMid) continue;
    const u = userForMember(prevMid);
    if (!u) continue;
    if (!u.roles.includes(role)) continue;
    const remaining = u.roles.filter((r) => r !== role);
    const newRoles = remaining.length > 0 ? remaining : ['member'];
    try {
      await setRoles(u.user_id, newRoles, prevMid);
    } catch {
      warnings.push('No se pudo actualizar el rol de un oficial saliente.');
    }
  }

  return warnings;
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

      // Acoplar la asignacion de la gestion a los roles de app: el Tesorero y el
      // Venerable entrantes reciben su rol; los salientes pasan a Miembro.
      const roleWarnings = await reconcileGestionRoles({
        newTesoreroMemberId: input.tesorero_member_id,
        newVmMemberId: input.vm_member_id,
        prevTesoreroMemberId: open?.tesorero_member_id ?? null,
        prevVmMemberId: open?.vm_member_id ?? null,
      });
      return { gestion: data, roleWarnings };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['gestiones'] });
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      if (res.roleWarnings.length > 0) {
        toast.warning(`Gestion creada, revisá los accesos: ${res.roleWarnings[0]}`);
      } else {
        toast.success('Gestion creada. La anterior quedo cerrada y los roles se actualizaron.');
      }
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
