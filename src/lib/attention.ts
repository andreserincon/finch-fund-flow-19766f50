/**
 * @file attention.ts
 * @description Single source of truth for "miembros que requieren atención"
 *   (morosos). Used by the Panel banner, the Inicio overview, and the Members
 *   filter so all three always show the SAME set and count.
 *
 *   Rule: an ACTIVE member requires attention when they owe more than one
 *   month's fee (their outstanding balance exceeds their current monthly fee).
 */

import { MemberBalance, FeeType } from '@/lib/types';

export type FeeRates = Record<FeeType, number>;

/** Outstanding amount a member owes (positive = owes money). */
export function memberOwed(m: MemberBalance): number {
  return m.total_fees_owed - m.total_paid;
}

/** True when an active member owes more than one month's fee. */
export function requiresAttention(m: MemberBalance, fees: FeeRates): boolean {
  return m.is_active && memberOwed(m) > (fees[m.fee_type] || 0);
}

/** The members requiring attention, sorted by amount owed (descending). */
export function getAttentionMembers(members: MemberBalance[], fees: FeeRates): MemberBalance[] {
  return members
    .filter((m) => requiresAttention(m, fees))
    .sort((a, b) => memberOwed(b) - memberOwed(a));
}

/** Total amount owed across the members requiring attention. */
export function attentionTotalOwed(members: MemberBalance[]): number {
  return members.reduce((s, m) => s + Math.max(0, memberOwed(m)), 0);
}
