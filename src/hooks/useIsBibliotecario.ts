/**
 * @file useIsBibliotecario.ts
 * @description Hook that checks if the current user has the
 *   'bibliotecario' (librarian) or 'admin' role, granting them
 *   permission to manage the physical and digital book catalogue.
 *   Derives from the shared useMyRoles() cached roles query.
 */
import { useMyRoles } from '@/hooks/useMyRoles';

export function useIsBibliotecario() {
  const { roles, isLoading } = useMyRoles();
  const isBibliotecario = roles.some((r) => r === 'bibliotecario' || r === 'admin');
  return { isBibliotecario, isLoading };
}
