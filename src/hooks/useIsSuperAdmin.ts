/**
 * @file useIsSuperAdmin.ts
 * @description Hook that checks whether the current user has the
 *   top-level 'admin' role. Super-admins can manage users and
 *   access the /user-management and /admin/members routes.
 *   Derives from the shared useMyRoles() cached roles query.
 */
import { useMyRoles } from '@/hooks/useMyRoles';

export function useIsSuperAdmin() {
  const { roles, isLoading } = useMyRoles();
  const isSuperAdmin = roles.includes('admin');
  return { isSuperAdmin, isLoading };
}
