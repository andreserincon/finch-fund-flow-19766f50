/**
 * @file useIsAdmin.ts
 * @description Hook that checks whether the current user has admin-level
 *   privileges (role = 'treasurer' or 'admin' in user_roles table).
 *   Used to gate write-access routes like /log-payment, /log-expense.
 *   Derives from the shared useMyRoles() so it shares one cached roles
 *   query instead of firing its own.
 */
import { useMyRoles } from '@/hooks/useMyRoles';

export function useIsAdmin() {
  const { roles, isLoading } = useMyRoles();
  const isAdmin = roles.some((r) => r === 'treasurer' || r === 'admin');
  return { isAdmin, isLoading };
}
