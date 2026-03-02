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

/** Denormalised user row returned by the `get_users_with_roles` RPC */
export interface UserWithRole {
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
      return data as UserWithRole[];
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

  return { users, isLoading, error, assignRole, removeRole };
}
