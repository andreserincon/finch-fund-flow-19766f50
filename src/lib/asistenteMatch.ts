/**
 * @file asistenteMatch.ts
 * @description Matcher deterministico y de acceso para el recorrido guiado del
 *   asistente ("Mostrame en la app").
 *
 *   Modulo PURO: sin React, sin DOM, sin red, sin efectos. Decide dos cosas, las
 *   dos del lado del cliente y nunca con ayuda del modelo:
 *
 *   1. matchTaskByText: a partir del texto libre que tipea el usuario, detecta a
 *      cual de las ocho tareas (T1..T8) se refiere, comparando contra los stems
 *      de intencion (KbTask.keywords) sin acentos ni mayusculas y por inclusion.
 *      Devuelve el id SOLO si coincide exactamente UNA tarea; si no coincide
 *      ninguna o coinciden dos o mas (ambiguo), devuelve null y no se ofrece el
 *      boton. El modelo NUNCA dispara ni rutea el recorrido.
 *
 *   2. canAccessTour: dado el nivel de acceso de la tarea y los flags de rol del
 *      usuario, decide si corresponde mostrarle el boton del recorrido. Es el
 *      espejo de los guards de App.tsx (AdminRoute / TreasuryStaffRoute /
 *      TreasuryRoute), asi el boton no aparece para una pantalla a la que el
 *      usuario seria redirigido.
 *
 *   Los chips de la UI no pasan por matchTaskByText: cada chip lleva su id de
 *   tarea explicito, asi su deteccion es exacta. Este matcher cubre el caso de
 *   una pregunta tipeada a mano.
 */

import {
  ASISTENTE_TASKS,
  type KbTask,
  type KbTaskId,
  type KbTaskAccess,
} from '@/lib/asistenteKb';

/** Flags de rol del usuario, los mismos que usan los guards de App.tsx. */
export interface TourAccessFlags {
  isAdmin: boolean;
  canViewTreasury: boolean;
  isMemberOnly: boolean;
}

/**
 * Normaliza un texto para comparar intencion: minusculas y sin diacriticos
 * (NFD descompone los acentos en marcas combinantes y luego se quitan). Asi
 * "Cápita" y "capita", o "transfiero" y "transfiero", comparan igual.
 */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Busca una tarea por id. Devuelve undefined si no existe. */
export function findTaskById(id: string): KbTask | undefined {
  return ASISTENTE_TASKS.find((task) => task.id === id);
}

/**
 * Detecta la tarea de una pregunta de texto libre. Normaliza el texto y, para
 * cada tarea, considera que coincide si el texto normalizado CONTIENE alguno de
 * sus keywords normalizados. Devuelve el id SOLO si coincide exactamente una
 * tarea; devuelve null si no coincide ninguna o si coinciden dos o mas
 * (ambiguo, no se ofrece boton).
 */
export function matchTaskByText(text: string): KbTaskId | null {
  const normalized = normalizeText(text);

  const matches: KbTaskId[] = [];
  for (const task of ASISTENTE_TASKS) {
    const hit = task.keywords.some((kw) =>
      normalized.includes(normalizeText(kw)),
    );
    if (hit) matches.push(task.id);
  }

  return matches.length === 1 ? matches[0] : null;
}

/**
 * Decide si el usuario puede ver el boton del recorrido de una tarea, segun su
 * nivel de acceso. Espejo de los guards de App.tsx:
 *   - 'admin'    -> isAdmin (AdminRoute).
 *   - 'staff'    -> canViewTreasury && !isMemberOnly (TreasuryStaffRoute).
 *   - 'treasury' -> canViewTreasury (TreasuryRoute).
 */
export function canAccessTour(
  access: KbTaskAccess,
  flags: TourAccessFlags,
): boolean {
  switch (access) {
    case 'admin':
      return flags.isAdmin;
    case 'staff':
      return flags.canViewTreasury && !flags.isMemberOnly;
    case 'treasury':
      return flags.canViewTreasury;
    default:
      return false;
  }
}
