/**
 * @file medallas-types.ts
 * @description Types and labels for the medal inventory (single medal type):
 *   in/out movements backed by medal_inventory_movements, stock from the
 *   medal_stock view. An "out" can be a delivery with a linked member charge
 *   (entrega_con_cargo) or by iniciacion (no counter-payment).
 */

export type MedalMovementType = 'in' | 'out';

export type MedalMovementReason =
  | 'compra'
  | 'ajuste_entrada'
  | 'entrega_con_cargo'
  | 'iniciacion'
  | 'ajuste_salida';

export interface MedalMovement {
  id: string;
  movement_type: MedalMovementType;
  quantity: number;
  movement_date: string;
  member_id: string | null;
  reason: MedalMovementReason;
  charge_id: string | null;
  note: string | null;
  created_at: string;
  /** Embedded member name for deliveries. */
  member?: { full_name: string } | null;
}

export const MEDAL_REASON_LABELS: Record<MedalMovementReason, string> = {
  compra: 'Compra',
  ajuste_entrada: 'Ajuste (entrada)',
  entrega_con_cargo: 'Entrega con cargo',
  iniciacion: 'Iniciación',
  ajuste_salida: 'Ajuste (salida)',
};
