import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function useIsBibliotecario() {
  const { user } = useAuth();

  const { data: isBibliotecario, isLoading } = useQuery({
    queryKey: ['is-bibliotecario', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .in('role', ['bibliotecario', 'admin'] as any[])
        .maybeSingle();
      if (error) {
        console.error('Error checking bibliotecario status:', error);
        return false;
      }
      return !!data;
    },
    enabled: !!user?.id,
  });

  return { isBibliotecario: isBibliotecario ?? false, isLoading };
}
