import { describe, expect, it } from 'vitest';
import { transferDeltaFor, transferOutAmount } from './transfers';

describe('transfer amounts', () => {
  it('debits the origin in its own currency on a pesos -> dólares transfer', () => {
    const t = { amount: 100, source_amount: 145000, from_account: 'bank' as const, to_account: 'savings' as const };
    expect(transferDeltaFor(t, 'bank')).toBe(-145000);
    expect(transferDeltaFor(t, 'savings')).toBe(100);
    expect(transferDeltaFor(t, 'great_lodge')).toBe(0);
  });

  it('falls back to amount when source_amount is missing', () => {
    const t = { amount: 5000, source_amount: null, from_account: 'bank' as const, to_account: 'great_lodge' as const };
    expect(transferOutAmount(t)).toBe(5000);
    expect(transferDeltaFor(t, 'bank')).toBe(-5000);
    expect(transferDeltaFor(t, 'great_lodge')).toBe(5000);
  });
});
