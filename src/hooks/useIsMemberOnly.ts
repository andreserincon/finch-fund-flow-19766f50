/**
 * @file useIsMemberOnly.ts
 * @description Hook that checks if the current user has only the
 *   'member' role (read-only treasury access). Member-only users
 *   can view dashboards but cannot modify financial data.
 *   Derives from the shared useMyRoles() cached roles query.
 */
import { useMyRoles } from '@/hooks/useMyRoles';

export function useIsMemberOnly() {
  const { roles, isLoading } = useMyRoles();
  // Fail closed: member-only means they have at least one role and EVERY role
  // is 'member'. A user with any non-member role is not member-only. The real
  // privacy boundary is Postgres RLS; this hook only drives UI gating.
  const isMemberOnly = roles.length > 0 && roles.every((r) => r === 'member');
  return { isMemberOnly, isLoading };
}
