import { describe, it, expect } from 'vitest';
import { getMemberCapitaStatus, FeeRates, MemberEventTotals } from '@/lib/attention';
import { MemberBalance } from '@/lib/types';

/**
 * Tests for getMemberCapitaStatus, the four-state capita-only derivation.
 * Fee rate is 1000/month for both fee types so the math reads cleanly.
 */
const FEES: FeeRates = { standard: 1000, solidarity: 1000 };

/** Build a MemberBalance with only the fields the derivation reads. */
function member(overrides: Partial<MemberBalance>): MemberBalance {
  return {
    member_id: 'm1',
    full_name: 'Test Member',
    phone_number: '0001',
    whatsapp_number: null,
    whatsapp_opt_out: false,
    monthly_fee_amount: 1000,
    fee_type: 'standard',
    is_active: true,
    join_date: '2026-01-01',
    current_balance: 0,
    months_since_join: 6,
    total_fees_owed: 6000,
    total_paid: 6000,
    lodge_office: null,
    inactive_since: null,
    ...overrides,
  };
}

describe('getMemberCapitaStatus', () => {
  it('fully paid (owes nothing, no credit) is al_dia', () => {
    // 6 months owed, 6 months paid, balance exactly zero.
    const m = member({ total_fees_owed: 6000, total_paid: 6000 });
    expect(getMemberCapitaStatus(m, FEES)).toBe('al_dia');
  });

  it('overpaid (real credit) is adelantado', () => {
    // Paid one extra month beyond what is owed.
    const m = member({ total_fees_owed: 6000, total_paid: 7000 });
    expect(getMemberCapitaStatus(m, FEES)).toBe('adelantado');
  });

  it('owes exactly the current month is impago', () => {
    // Owed 6 months, paid 5: the only gap is the current (6th) month.
    const m = member({ total_fees_owed: 6000, total_paid: 5000 });
    expect(getMemberCapitaStatus(m, FEES)).toBe('impago');
  });

  it('owes 2+ months (a prior month unpaid) is demorado', () => {
    // Owed 6 months, paid 4: covers only through month 4, so months 5 and 6
    // are unpaid -> a prior month is past its deadline.
    const m = member({ total_fees_owed: 6000, total_paid: 4000 });
    expect(getMemberCapitaStatus(m, FEES)).toBe('demorado');
  });

  it('member who joined mid-year, paid in full, is al_dia', () => {
    // Joined later, so only 3 months owed; paid all 3.
    const m = member({
      join_date: '2026-04-01',
      months_since_join: 3,
      total_fees_owed: 3000,
      total_paid: 3000,
    });
    expect(getMemberCapitaStatus(m, FEES)).toBe('al_dia');
  });

  it('member who joined mid-year, owes only current month, is impago', () => {
    // 3 months owed, paid 2: only the current month is open.
    const m = member({
      join_date: '2026-04-01',
      months_since_join: 3,
      total_fees_owed: 3000,
      total_paid: 2000,
    });
    expect(getMemberCapitaStatus(m, FEES)).toBe('impago');
  });

  it('excludes event debt: owes only an event but capita is even -> al_dia', () => {
    // total_fees_owed and total_paid both include a 5000 event the member has
    // NOT paid. Capita itself is square (6000 vs 6000).
    const ev: MemberEventTotals = { owed: { m1: 5000 }, paid: { m1: 0 } };
    const m = member({ total_fees_owed: 11000, total_paid: 6000 });
    expect(getMemberCapitaStatus(m, FEES, undefined, ev)).toBe('al_dia');
  });

  it('excludes event credit: event paid but a prior capita month unpaid -> demorado', () => {
    // Event of 5000 fully paid (so a naive balance looks even), but capita is
    // 6000 owed with only 4000 paid -> two capita months behind.
    const ev: MemberEventTotals = { owed: { m1: 5000 }, paid: { m1: 5000 } };
    const m = member({ total_fees_owed: 11000, total_paid: 9000 });
    expect(getMemberCapitaStatus(m, FEES, undefined, ev)).toBe('demorado');
  });
});
