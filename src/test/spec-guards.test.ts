/* eslint-disable no-restricted-syntax */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * Source-tree guards for decisions that a type checker cannot enforce.
 *
 * These read the tree as text and assert on it, so they catch a banned token
 * even where it hides in a cn() call or a template string, which an AST-scoped
 * lint rule tied to the className attribute would miss.
 */

const SRC = join(process.cwd(), 'src');

// Paths where the token is legitimate and must be ignored. Kept as an explicit
// allowlist rather than a "comments" exclusion, because a text scan cannot tell
// a comment from code without parsing.
const LANDSCAPE_ALLOWLIST = [
  'src/i18n/locales/es.ts', // `landscape` is a property KEY; its value is 'Vista horizontal'
  'src/test/spec-guards.test.ts', // this file: it must carry the pattern to assert against it
];

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function toRepoPath(full: string): string {
  return relative(process.cwd(), full).split(sep).join('/');
}

describe('landscape: variant guard (R1 / P0.1)', () => {
  it('no source file outside the allowlist carries a `landscape:` utility', () => {
    const offenders: string[] = [];
    for (const full of walk(SRC, ['.ts', '.tsx', '.css'])) {
      const repoPath = toRepoPath(full);
      if (LANDSCAPE_ALLOWLIST.includes(repoPath)) continue;
      const text = readFileSync(full, 'utf8');
      text.split('\n').forEach((line, i) => {
        if (/(^|\s)landscape:/.test(line)) {
          offenders.push(`${repoPath}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
