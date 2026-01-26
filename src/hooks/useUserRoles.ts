import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export type AppRole = 'treasurer' | 'vm' | 'member';

export interface UserWithRole {
  user_id: string;
  email: string;
  role: AppRole | null;
  role_assigned_at: string | null;
  member_id: string | null;
}

export function useUserRoles() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: users, isLoading, error } = useQuery({
    queryKey: ['users-with-roles'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_users_with_roles');
      if (error) throw error;
      return data as UserWithRole[];
    },
  });

  const assignRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      // First, delete existing role for this user
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      // Then insert new role
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
      console.error('Error assigning role:', error);
      toast.error(t('userManagement.roleAssignError'));
    },
  });

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
      console.error('Error removing role:', error);
      toast.error(t('userManagement.roleRemoveError'));
    },
  });

  return {
    users,
    isLoading,
    error,
    assignRole,
    removeRole,
  };
}
