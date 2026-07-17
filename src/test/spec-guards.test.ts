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

/**
 * Accent guard (R2 / P1.4). "cápita" was spelled unaccented across the
 * calculator's copy. A grep cannot express this: it either matches the glossary
 * identifier `glPctCapita` and the export filename template (both legitimate) or
 * misses the capital-C plural that is the actual defect. So it is a text scan
 * that reads only the user-visible copy: the feeCalculator i18n block, its nav
 * label, and the export label cells in the page.
 */

// Matches an unaccented "Capita" / "capita" / "Capitas" / "capitas" at a word
// boundary. "Cápita" does not match: the accented a is a different codepoint.
const UNACCENTED_CAPITA = /[Cc]apitas?\b/;

// Legitimate carriers of the bare token. Not user-visible copy.
const CAPITA_ALLOWED = [
  'glPctCapita', // a glossary termKey / identifier, consumed by asistenteKb.ts
  'capitas-', // the export filename template `capitas-${...}.xlsx`; ASCII is right in a filename
];

function stripAllowed(line: string): string {
  let out = line;
  for (const tok of CAPITA_ALLOWED) out = out.split(tok).join('');
  return out;
}

// Pull the body of a named object block, brace-matched, from source text.
function extractBlock(text: string, marker: string): string {
  const start = text.indexOf(marker);
  if (start === -1) throw new Error(`block marker not found: ${marker}`);
  let depth = 0;
  let i = text.indexOf('{', start);
  const from = i;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(from, i + 1);
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

describe('cápita accent guard (R2 / P1.4)', () => {
  const esText = readFileSync(join(SRC, 'i18n', 'locales', 'es.ts'), 'utf8');

  it('the feeCalculator i18n block spells cápita with its accent', () => {
    const block = extractBlock(esText, 'feeCalculator: {');
    const offenders = block
      .split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => UNACCENTED_CAPITA.test(stripAllowed(line)))
      .map(({ i }) => `feeCalculator block line +${i}: matched unaccented capita`);
    expect(offenders).toEqual([]);
  });

  it('the nav label reads "Calculadora de Cápitas"', () => {
    expect(esText).toMatch(/feeCalculator:\s*'Calculadora de Cápitas'/);
    expect(esText).not.toMatch(/feeCalculator:\s*'Calculadora de Capitas'/);
  });

  it('the calculator page carries no unaccented capita in user-visible copy', () => {
    const pageText = readFileSync(join(SRC, 'pages', 'FeeCalculator.tsx'), 'utf8');
    const offenders = pageText
      .split('\n')
      .map((line, i) => ({ line, i }))
      // only quoted string literals are user-visible copy; skip comments
      .filter(({ line }) => /['"`]/.test(line) && !line.trimStart().startsWith('//'))
      .filter(({ line }) => UNACCENTED_CAPITA.test(stripAllowed(line)))
      .map(({ line, i }) => `FeeCalculator.tsx:${i + 1}: ${line.trim().slice(0, 60)}`);
    expect(offenders).toEqual([]);
  });

  it('the dead preset keys are gone', () => {
    const block = extractBlock(esText, 'feeCalculator: {');
    expect(block).not.toMatch(/\blow:\s*'/);
    expect(block).not.toMatch(/\bhigh:\s*'/);
    expect(block).not.toMatch(/\bbaseline:\s*'/);
    expect(block).not.toMatch(/\bvsBaseline:\s*'/);
  });

  it('the primer names the shipped presets, not the retired ones', () => {
    const block = extractBlock(esText, 'feeCalculator: {');
    expect(block).toMatch(/Ratio GL/);
    expect(block).toMatch(/GL 65%/);
    expect(block).not.toMatch(/conservadora/);
    expect(block).not.toMatch(/agresiva/);
  });
});
