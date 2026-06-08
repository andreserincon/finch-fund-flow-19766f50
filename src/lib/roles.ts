/**
 * @file roles.ts
 * @description Single source of truth for the app roles on the UI side: their
 *   Spanish display names, one-line descriptions for the role picker, and which
 *   roles a Venerable (vm) is allowed to grant. The real authorization lives in
 *   the edge functions and RLS; this only drives labels and the picker.
 */
import type { AppRole } from '@/hooks/useUserRoles';

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  treasurer: 'Tesorero',
  vm: 'Venerable',
  bibliotecario: 'Bibliotecario',
  member: 'Miembro',
};

export function getRoleLabel(role: AppRole | null | undefined): string {
  if (!role) return 'Sin rol';
  return ROLE_LABELS[role] ?? role;
}

export interface RoleOption {
  value: AppRole;
  label: string;
  description: string;
}

// Lowest to highest authority. A Venerable only sees the first two.
export const ROLE_OPTIONS: RoleOption[] = [
  { value: 'member', label: 'Miembro', description: 'Ve su propia informacion de pagos y la biblioteca.' },
  { value: 'bibliotecario', label: 'Bibliotecario', description: 'Gestiona el catalogo y el repositorio digital.' },
  { value: 'vm', label: 'Venerable', description: 'Lectura de toda la tesoreria. Puede otorgar accesos.' },
  { value: 'treasurer', label: 'Tesorero', description: 'Registra pagos, gastos, prestamos y reportes.' },
  { value: 'admin', label: 'Administrador', description: 'Acceso total. Gestiona usuarios, roles y configuracion.' },
];

// Roles a Venerable (vm) may grant. Only an admin may grant the rest.
export const VM_GRANTABLE_ROLES: AppRole[] = ['member', 'bibliotecario'];

export function roleOptionsFor(callerIsAdmin: boolean): RoleOption[] {
  return callerIsAdmin
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((o) => VM_GRANTABLE_ROLES.includes(o.value));
}
