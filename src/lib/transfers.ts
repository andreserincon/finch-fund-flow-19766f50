/**
 * @file transfers.ts
 * @description Amount helpers for inter-account transfers.
 *   `amount` is what arrives in to_account (destination currency);
 *   `source_amount` is what leaves from_account (origin currency). The two
 *   only differ on cross-currency transfers (pesos ↔ dólares); a NULL
 *   source_amount means "same as amount".
 */

import type { AccountTransfer, AccountType } from '@/lib/types';

type TransferAmounts = Pick<AccountTransfer, 'amount' | 'from_account' | 'to_account'> & {
  source_amount?: number | null;
};

/** Amount debited from the origin account, in the origin account's currency */
export function transferOutAmount(t: TransferAmounts): number {
  return Number(t.source_amount ?? t.amount);
}

/** Amount credited to the destination account, in its currency */
export function transferInAmount(t: TransferAmounts): number {
  return Number(t.amount);
}

/** Net effect of a transfer on one account (negative = egreso) */
export function transferDeltaFor(t: TransferAmounts, account: AccountType): number {
  let delta = 0;
  if (t.from_account === account) delta -= transferOutAmount(t);
  if (t.to_account === account) delta += transferInAmount(t);
  return delta;
}
