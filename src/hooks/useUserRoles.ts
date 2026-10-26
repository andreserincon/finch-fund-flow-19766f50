/**
 * @file useUserRoles.ts
 * @description Hook for managing user accounts and their app_role
 *   assignments. Uses the `get_users_with_roles` RPC to fetch a
 *   denormalised view of users + roles + linked member info.
 *   Provides assign / remove role mutations (super-admin only).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

/** Possible application roles */
export type AppRole = 'treasurer' | 'vm' | 'member' | 'bibliotecario' | 'admin';

/** Masonic degree (used for grade display alongside the user) */
export type MasonicGrade = 'aprendiz' | 'companero' | 'maestro';

/**
 * One user with ALL their roles grouped into an array. The `get_users_with_roles`
 * RPC returns one row per (user, role); a user can have more than one role, so
 * we group the rows by user_id into a single entry with a `roles` array.
 */
export interface UserWithRole {
  user_id: string;
  email: string;
  roles: AppRole[];
  role_assigned_at: string | null;
  member_id: string | null;
  member_name: string | null;
  masonic_grade: MasonicGrade | null;
}

/** Raw row shape returned by the RPC (one per user+role). */
interface UserRoleRow {
  user_id: string;
  email: string;
  role: AppRole | null;
  role_assigned_at: string | null;
  member_id: string | null;
  member_name: string | null;
  masonic_grade: MasonicGrade | null;
}

export function useUserRoles() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  /** Fetch all users with their roles via a database function */
  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users-with-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_users_with_roles');
      if (error) throw error;
      // Group the one-row-per-role result into one entry per user with a roles array.
      const rows = (data ?? []) as UserRoleRow[];
      const byUser = new Map<string, UserWithRole>();
      for (const r of rows) {
        const existing = byUser.get(r.user_id);
        if (existing) {
          if (r.role && !existing.roles.includes(r.role)) existing.roles.push(r.role);
        } else {
          byUser.set(r.user_id, {
            user_id: r.user_id,
            email: r.email,
            roles: r.role ? [r.role] : [],
            role_assigned_at: r.role_assigned_at,
            member_id: r.member_id,
            member_name: r.member_name,
            masonic_grade: r.masonic_grade,
          });
        }
      }
      return Array.from(byUser.values());
    },
  });

  /** Replace a user's role (delete existing → insert new) */
  const assignRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      // Remove any existing role first
      await supabase.from('user_roles').delete().eq('user_id', userId);
      // Insert the new role
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success(t('userManagement.roleAssigned'));
    },
    onError: (error) => {
      if (import.meta.env.DEV) console.error('Error assigning role:', error);
      toast.error(t('userManagement.roleAssignError'));
    },
  });

  /** Remove a user's role entirely */
  const removeRole = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      toast.success(t('userManagement.roleRemoved'));
    },
    onError: (error) => {
      if (import.meta.env.DEV) console.error('Error removing role:', error);
      toast.error(t('userManagement.roleRemoveError'));
    },
  });

  /** Delete a user account entirely (via the admin-delete-user edge function) */
  const deleteUser = useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', {
        body: { userId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success('Cuenta eliminada.');
    },
    onError: (error: Error) => {
      toast.error(`Error al eliminar la cuenta: ${error.message}`);
    },
  });

  return { users, isLoading, error, assignRole, removeRole, deleteUser };
}
