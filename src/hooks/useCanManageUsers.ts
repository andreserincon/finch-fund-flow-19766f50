/**
 * @file useCanManageUsers.ts
 * @description True when the current user may manage accesses (create users,
 *   assign roles, send reset links): an Administrator or a Venerable (vm). The
 *   real gate is the edge functions plus RLS; this drives the route guard and
 *   the UI affordances. Derives from the shared useMyRoles() cached roles query.
 */
import { useMyRoles } from '@/hooks/useMyRoles';

export function useCanManageUsers() {
  const { roles, isLoading } = useMyRoles();
  const canManageUsers = roles.some((r) => r === 'admin' || r === 'vm');
  return { canManageUsers, isLoading };
}
