import { useState } from 'react';

/**
 * Raw text the user types, and the committed number that actually computes.
 *
 * Commit is on blur or Enter, never per keystroke. A mid-number keystroke on a
 * five-digit ARS amount would otherwise compute a real-looking wrong answer in
 * alarm colours (a cápita of $1 against the full GL cost reads as a massive
 * negative net income). The screen is read-only advisory, so nothing is saved
 * live and there is no cost to waiting for the commit.
 *
 * The clamp is on the derived value, not the input: `min={0}` on a controlled
 * number input only affects the spinner, so a typed `-500` still reaches the
 * computation. `Math.max(0, ...)` catches it.
 */
export function useCommittedNumber(initial = 0) {
  const [raw, setRaw] = useState('');
  const [committed, setCommitted] = useState(initial);

  const clamp = (s: string) => Math.max(0, parseFloat(s) || 0);
  const pending = raw !== '' && clamp(raw) !== committed;
  const commit = () => setCommitted(clamp(raw));

  const inputProps = {
    value: raw,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setRaw(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Enter blurs, which fires onBlur, which commits: one path, no double commit.
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
  };

  return { raw, committed, pending, commit, setRaw, inputProps };
}
