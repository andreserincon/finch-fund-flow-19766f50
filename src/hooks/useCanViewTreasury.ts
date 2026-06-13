/**
 * @file useCanViewTreasury.ts
 * @description Hook that determines whether the current user is
 *   allowed to view treasury data (dashboard, members, etc.).
 *   Permitted roles: treasurer, vm, admin, member.
 *   Derives from the shared useMyRoles() cached roles query.
 */
import { useMyRoles } from '@/hooks/useMyRoles';

const VIEW_ROLES = ['treasurer', 'vm', 'admin', 'member'];

export function useCanViewTreasury() {
  const { roles, isLoading } = useMyRoles();
  const canViewTreasury = roles.some((r) => VIEW_ROLES.includes(r));
  return { canViewTreasury, isLoading };
}
