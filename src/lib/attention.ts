/**
 * @file attention.ts
 * @description Single source of truth for "miembros que requieren atención"
 *   (pago demorado). Used by the Panel banner + "Pago Demorado" card, the
 *   Inicio overview, and the Members filter so all of them show the SAME set
 *   and count.
 *
 *   Rule: an ACTIVE member requires attention when their MONTHLY CAPITA debt
 *   exceeds one month's fee. Event debt is intentionally excluded: events have
 *   their own status (Evento impago / Evento demorado) and are not part of the
 *   "requiere atención" / "pago demorado" count.
 */

import { MemberBalance, FeeType } from '@/lib/types';

export type FeeRates = Record<FeeType, number>;

/** Per-member event totals, keyed by member_id. */
export interface MemberEventTotals {
  owed: Record<string, number>;
  paid: Record<string, number>;
}

const EMPTY_EVENTS: MemberEventTotals = { owed: {}, paid: {} };

/**
 * Capita-only outstanding for a member (positive = owes monthly dues).
 * Strips the event portion from both sides so a member who is current on
 * capitas but owes an event is NOT counted here.
 */
export function capitaOwed(m: MemberBalance, ev: MemberEventTotals = EMPTY_EVENTS): number {
  const eventOwed = ev.owed[m.member_id] || 0;
  const eventPaid = ev.paid[m.member_id] || 0;
  const monthlyOwed = m.total_fees_owed - eventOwed;
  const monthlyPaid = m.total_paid - eventPaid;
  return monthlyOwed - monthlyPaid;
}

/** True when an active member owes more than one month's capita. */
export function requiresAttention(m: MemberBalance, fees: FeeRates, ev: MemberEventTotals = EMPTY_EVENTS): boolean {
  return m.is_active && capitaOwed(m, ev) > (fees[m.fee_type] || 0);
}

/** The members requiring attention, sorted by capita owed (descending). */
export function getAttentionMembers(members: MemberBalance[], fees: FeeRates, ev: MemberEventTotals = EMPTY_EVENTS): MemberBalance[] {
  return members
    .filter((m) => requiresAttention(m, fees, ev))
    .sort((a, b) => capitaOwed(b, ev) - capitaOwed(a, ev));
}

/** Total capita owed across the members requiring attention. */
export function attentionTotalOwed(members: MemberBalance[], ev: MemberEventTotals = EMPTY_EVENTS): number {
  return members.reduce((s, m) => s + Math.max(0, capitaOwed(m, ev)), 0);
}
