/**
 * @file cobros-types.ts
 * @description Types and labels for member charges (cuentas por cobrar):
 *   one-off amounts a member owes the lodge (medals, rituals, derechos),
 *   with partial payments. Backed by the member_charges /
 *   member_charge_payments tables.
 */

export type ChargeCategory =
  | 'medalla'
  | 'ritual'
  | 'derecho_iniciacion'
  | 'derecho_exaltacion'
  | 'derecho_aumento'
  | 'otro';

export type ChargeCurrency = 'ARS' | 'USD';

export type ChargeStatus = 'pending' | 'partial' | 'paid' | 'cancelled';

export interface MemberCharge {
  id: string;
  member_id: string;
  category: ChargeCategory;
  note: string | null;
  amount: number;
  amount_paid: number;
  currency: ChargeCurrency;
  charge_date: string;
  status: ChargeStatus;
  paid_date: string | null;
  created_at: string;
  /** Embedded member name from the related members row. */
  member?: { full_name: string } | null;
}

export const CHARGE_CATEGORY_LABELS: Record<ChargeCategory, string> = {
  medalla: 'Medalla',
  ritual: 'Ritual',
  derecho_iniciacion: 'Derecho de iniciación',
  derecho_exaltacion: 'Derecho de exaltación',
  derecho_aumento: 'Derecho de aumento',
  otro: 'Otro',
};

export const CHARGE_CATEGORY_OPTIONS: { value: ChargeCategory; label: string }[] = [
  { value: 'medalla', label: 'Medalla' },
  { value: 'ritual', label: 'Ritual' },
  { value: 'derecho_iniciacion', label: 'Derecho de iniciación' },
  { value: 'derecho_exaltacion', label: 'Derecho de exaltación' },
  { value: 'derecho_aumento', label: 'Derecho de aumento' },
  { value: 'otro', label: 'Otro' },
];

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
  cancelled: 'Anulado',
};

/** Outstanding balance of a charge. */
export function chargeBalance(c: Pick<MemberCharge, 'amount' | 'amount_paid'>): number {
  return Math.max(0, Number(c.amount) - Number(c.amount_paid));
}
