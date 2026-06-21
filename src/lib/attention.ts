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

import { MemberBalance, FeeType, PaymentStatus } from '@/lib/types';

export type FeeRates = Record<FeeType, number>;

/** Tolerance for floating-point capita comparisons (sub-cent). */
const EPSILON = 0.01;

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

/**
 * Capita-only paid total for a member (event payments stripped out), used to
 * decide whether prior months are covered. Mirrors the stripping in capitaOwed.
 */
function capitaPaid(m: MemberBalance, ev: MemberEventTotals): number {
  return m.total_paid - (ev.paid[m.member_id] || 0);
}

/**
 * Classify a member's MONTHLY CAPITA standing into one of the four canonical
 * states. Event debt is excluded (reuses capitaOwed's stripping), so a member
 * who is current on capitas but owes an event is never shown as impago/demorado.
 *
 * The "owes a prior month" test mirrors the fee matrix's per-cell rule. The
 * matrix marks a month as covered when total capita paid reaches the cumulative
 * owed THROUGH that month. So a member only owes the current month (impago) when
 * their capita paid already covers everything owed through the PREVIOUS month;
 * if it does not, an earlier month is unpaid and the deadline has passed
 * (demorado). owedThroughPrevMonth = capitaOwed (total) minus this month's fee.
 *
 * @param m              member balance row (carries capita-only owed/paid once events are stripped)
 * @param fees           current-month capita fee per fee_type
 * @param _currentMonth  reserved for API symmetry with the matrix; the figures
 *                       in m are already computed as of the reference month
 * @param ev             per-member event totals to strip from both sides
 */
export function getMemberCapitaStatus(
  m: MemberBalance,
  fees: FeeRates,
  _currentMonth?: Date,
  ev: MemberEventTotals = EMPTY_EVENTS,
): PaymentStatus {
  const owed = capitaOwed(m, ev);
  const monthlyFee = fees[m.fee_type] || 0;

  // Fully paid or in credit. A real credit (paid strictly more than owed) is
  // "adelantado"; exactly even (within epsilon) is "al_dia".
  if (owed <= EPSILON) {
    return owed < -EPSILON ? 'adelantado' : 'al_dia';
  }

  // Owes something. Did capita paid cover everything owed through last month?
  // If yes, the only debt is the current month -> impago. If not, a prior
  // month is unpaid past its deadline -> demorado.
  const owedThroughPrevMonth = (m.total_fees_owed - (ev.owed[m.member_id] || 0)) - monthlyFee;
  const coversPrevMonths = capitaPaid(m, ev) >= owedThroughPrevMonth - EPSILON;
  return coversPrevMonths ? 'impago' : 'demorado';
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
