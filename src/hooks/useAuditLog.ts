/**
 * @file useAuditLog.ts
 * @description Reads the audit_log (bitacora): every INSERT/UPDATE/DELETE on the
 *   money and parameter tables, with the actor and the before/after snapshot.
 *   Only Admin/Venerable can read it (enforced by RLS); the trigger writes it.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditEntry {
  id: string;
  table_name: string;
  row_id: string | null;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actor_user_id: string | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed_at: string;
}

export function useAuditLog(limit = 300) {
  const query = useQuery({
    queryKey: ['audit_log', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as AuditEntry[];
    },
  });

  return {
    entries: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
