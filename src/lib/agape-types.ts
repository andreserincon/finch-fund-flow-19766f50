/**
 * @file agape-types.ts
 * @description Tipos y logica pura del modulo de agapes (comidas entre hermanos
 *   donde UNO recauda la plata de todos). Independiente de las finanzas del
 *   taller: no toca transactions ni member_balances. Respaldado por las tablas
 *   agapes / agape_participants.
 *
 *   El objetivo a recaudar es el total gastado + la propina. Cada comensal tiene
 *   una "parte" (igual o cargada a mano); al cobrar se marca el medio de pago y,
 *   si paga en efectivo, se le aplica el % de descuento del agape.
 */

export type AgapeStatus = 'open' | 'closed';
export type AgapeSplitMode = 'equal' | 'custom';
export type AgapePaymentMethod = 'efectivo' | 'tarjeta' | 'ya_pago';

export interface Agape {
  id: string;
  title: string;
  agape_date: string;
  total_amount: number;
  tip_amount: number;
  cash_discount_pct: number;
  split_mode: AgapeSplitMode;
  status: AgapeStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgapeParticipant {
  id: string;
  agape_id: string;
  member_id: string | null;
  guest_name: string | null;
  share_amount: number;
  paid: boolean;
  payment_method: AgapePaymentMethod | null;
  discount_applied: number;
  amount_paid: number;
  paid_at: string | null;
  created_at: string;
  /** Nombre embebido del hermano (join a members); null si es invitado. */
  member?: { full_name: string } | null;
}

export const PAYMENT_METHOD_LABELS: Record<AgapePaymentMethod, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  ya_pago: 'Ya pagó',
};

/** Nombre a mostrar de un comensal: el hermano, o el nombre del invitado. */
export function participantName(p: AgapeParticipant): string {
  return p.member?.full_name ?? p.guest_name ?? 'Sin nombre';
}

/** Redondeo a 2 decimales, estable para plata. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Lo que efectivamente paga un comensal segun el medio y el % de descuento del
 * agape. El descuento SOLO aplica a efectivo; tarjeta y "ya pago" pagan la parte
 * completa. Devuelve el descuento aplicado y el monto pagado.
 */
export function computePayment(
  share: number,
  method: AgapePaymentMethod,
  cashDiscountPct: number,
): { discountApplied: number; amountPaid: number } {
  if (method === 'efectivo' && cashDiscountPct > 0) {
    const discountApplied = round2((share * cashDiscountPct) / 100);
    return { discountApplied, amountPaid: round2(share - discountApplied) };
  }
  return { discountApplied: 0, amountPaid: round2(share) };
}

/**
 * Reparto en partes iguales del objetivo entre n comensales. El resto de los
 * centavos se carga a los primeros, para que la suma cierre exacto.
 */
export function splitEqual(objetivo: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(objetivo * 100);
  const base = Math.floor(cents / n);
  const extra = cents - base * n;
  return Array.from({ length: n }, (_, i) => round2((base + (i < extra ? 1 : 0)) / 100));
}

export interface AgapeTotals {
  /** Lo que hay que juntar: total gastado + propina. */
  objetivo: number;
  /** Suma de las partes cargadas (para avisar si no cuadra con el objetivo). */
  sumShares: number;
  /** Diferencia entre las partes y el objetivo (0 = cuadra). */
  shareDiff: number;
  recaudado: number;
  efectivo: number;
  tarjeta: number;
  yaPago: number;
  descuentos: number;
  /** Lo que falta recaudar (nunca negativo). */
  falta: number;
  pagados: number;
  total: number;
}

/** Totales de reconciliacion del agape, para el encabezado de la planilla. */
export function agapeTotals(agape: Pick<Agape, 'total_amount' | 'tip_amount'>, parts: AgapeParticipant[]): AgapeTotals {
  const objetivo = round2(Number(agape.total_amount) + Number(agape.tip_amount));
  let sumShares = 0, recaudado = 0, efectivo = 0, tarjeta = 0, yaPago = 0, descuentos = 0, pagados = 0;
  for (const p of parts) {
    sumShares += Number(p.share_amount);
    if (p.paid) {
      pagados += 1;
      recaudado += Number(p.amount_paid);
      descuentos += Number(p.discount_applied);
      if (p.payment_method === 'efectivo') efectivo += Number(p.amount_paid);
      else if (p.payment_method === 'tarjeta') tarjeta += Number(p.amount_paid);
      else if (p.payment_method === 'ya_pago') yaPago += Number(p.amount_paid);
    }
  }
  return {
    objetivo,
    sumShares: round2(sumShares),
    shareDiff: round2(sumShares - objetivo),
    recaudado: round2(recaudado),
    efectivo: round2(efectivo),
    tarjeta: round2(tarjeta),
    yaPago: round2(yaPago),
    descuentos: round2(descuentos),
    falta: Math.max(0, round2(objetivo - recaudado - descuentos)),
    pagados,
    total: parts.length,
  };
}
