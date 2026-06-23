/**
 * @file asistenteClient.ts
 * @description Pure, side-effect-free client helpers for the "asistente" chat.
 *
 *   These were factored out of AsistenteChat.tsx so the logic is unit-testable
 *   in isolation (Slice 5). Behavior is identical to the inline versions: this
 *   module has no React, no network, no Deno; it only transforms inputs to
 *   outputs.
 *
 *   What lives here:
 *   - parseAnthropicTextDelta(obj): given ONE parsed SSE event object, returns
 *     the text from a content_block_delta/text_delta or null for anything else.
 *     It deliberately does NOT read OpenAI choices[].delta.content.
 *   - parseAnthropicSSE(sse): given a full native-Anthropic SSE string, returns
 *     the concatenated assistant text from content_block_delta.delta.text only.
 *     Ignores message_start / content_block_start / content_block_stop /
 *     message_delta / message_stop / ping, SSE ":" comments, "event:" lines and
 *     blank lines. Never throws on malformed or partial lines.
 *   - buildAsistentePayload({ question, turns }): the exact wire body sent to the
 *     edge function: { question, turns, kb: buildKbText() } and nothing else. No
 *     balances, members, or live app data.
 *   - classifyAsistenteError(input): maps a failure to 'cap' | 'offline' |
 *     'down' using the S4 rules (HTTP 429 -> cap; navigator offline or a thrown
 *     network error -> offline; any other non-ok / empty stream -> down).
 */

import { buildKbText } from '@/lib/asistenteKb';

/** A single message kept in the visible conversation. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Wire shape sent to the edge function. Intentionally minimal: no app data. */
export interface AsistentePayload {
  question: string;
  turns: ChatMessage[];
  kb: string;
}

/**
 * The three graceful-degradation cases.
 *   - 'cap'     : 429, the monthly question cap was reached.
 *   - 'offline' : no connection (navigator.onLine is false, or fetch threw).
 *   - 'down'    : any other non-ok response (404 before deploy, 5xx, empty body).
 */
export type DegradeReason = 'cap' | 'offline' | 'down';

/**
 * Error that carries the degradation reason so a catch block can show the right
 * message + the fallback. A plain Error (or any other throw) is treated as a
 * generic outage ('down') by classifyAsistenteError, except a thrown fetch
 * network error / offline device, which is classified as 'offline'.
 */
export class AsistenteDegradeError extends Error {
  reason: DegradeReason;
  constructor(reason: DegradeReason, message?: string) {
    super(message ?? reason);
    this.name = 'AsistenteDegradeError';
    this.reason = reason;
  }
}

/**
 * Extract the assistant text delta from ONE parsed native-Anthropic SSE event.
 * Returns the text only for a content_block_delta whose delta is a text_delta
 * with a string text; returns null for every other event type (message_start,
 * content_block_start, content_block_stop, message_delta, message_stop, ping,
 * error) and for non-object inputs. It deliberately does NOT look at
 * OpenAI-style choices[].delta.content, so passing such an object yields null.
 */
export function parseAnthropicTextDelta(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const event = obj as {
    type?: unknown;
    delta?: { type?: unknown; text?: unknown };
  };
  if (
    event.type === 'content_block_delta' &&
    event.delta?.type === 'text_delta' &&
    typeof event.delta.text === 'string'
  ) {
    return event.delta.text;
  }
  // All other event types are intentionally ignored for the visible stream.
  return null;
}

/**
 * Parse a full native-Anthropic SSE string and return the concatenated
 * assistant text from content_block_delta.delta.text only.
 *
 * Each event arrives as one or more lines; the payload lines start with "data: "
 * and carry a JSON object whose `type` tells us what it is. SSE comments
 * (": ...", used for ping keep-alives), "event: <name>" lines and blank lines
 * are skipped. A line whose JSON does not parse is ignored (never throws), which
 * mirrors how the live reader tolerates partial lines at chunk boundaries.
 */
export function parseAnthropicSSE(sse: string): string {
  if (!sse) return '';

  let assistantText = '';
  const lines = sse.split('\n');

  for (let raw of lines) {
    if (raw.endsWith('\r')) raw = raw.slice(0, -1);
    // SSE comments (": ...", used for ping keep-alives) and blank lines.
    if (raw.startsWith(':') || raw.trim() === '') continue;
    // Native Anthropic SSE also emits "event: <name>" lines; the JSON is on the
    // "data:" line, so we read that one only.
    if (!raw.startsWith('data:')) continue;

    const jsonStr = raw.slice(5).trim();
    if (!jsonStr) continue;

    try {
      const obj = JSON.parse(jsonStr);
      const text = parseAnthropicTextDelta(obj);
      if (text !== null) assistantText += text;
    } catch {
      // A malformed or partial JSON line: ignore it rather than throwing.
      continue;
    }
  }

  return assistantText;
}

/**
 * Build the exact request body sent to the `asistente` edge function. The body
 * is ONLY { question, turns, kb }; `kb` is the static curated text from
 * buildKbText(). It never ships balances, members, transactions, or any live
 * app data.
 */
export function buildAsistentePayload({
  question,
  turns,
}: {
  question: string;
  turns: ChatMessage[];
}): AsistentePayload {
  return {
    question,
    turns,
    kb: buildKbText(),
  };
}

/**
 * Map a send failure to a graceful-degradation reason (S4 rules):
 *   - an HTTP 429 response (or a status of 429) -> 'cap'
 *   - the device reporting offline, or a thrown network error (TypeError) -> 'offline'
 *   - an AsistenteDegradeError keeps its own reason
 *   - any other non-ok response / empty stream / generic throw -> 'down'
 *
 * Accepts a Response, a thrown error, an AsistenteDegradeError, or a small
 * descriptor object so callers and tests can classify uniformly.
 */
export function classifyAsistenteError(
  input:
    | Response
    | Error
    | AsistenteDegradeError
    | { status?: number; offline?: boolean; emptyStream?: boolean }
    | unknown,
): DegradeReason {
  // An already-classified degradation keeps its reason.
  if (input instanceof AsistenteDegradeError) {
    return input.reason;
  }

  // A thrown network error (fetch rejects with a TypeError) means there is no
  // usable connection: treat it as offline.
  if (input instanceof TypeError) {
    return 'offline';
  }

  // A real fetch Response: branch on the status code, otherwise it is an outage.
  if (typeof Response !== 'undefined' && input instanceof Response) {
    if (input.status === 429) return 'cap';
    return 'down';
  }

  // A plain descriptor object (used by callers/tests that do not have a real
  // Response): honor explicit offline / status / emptyStream hints.
  if (input && typeof input === 'object') {
    const hint = input as { status?: number; offline?: boolean; emptyStream?: boolean };
    if (hint.offline === true) return 'offline';
    if (hint.status === 429) return 'cap';
    if (typeof hint.status === 'number') return 'down';
    if (hint.emptyStream === true) return 'down';
  }

  // Anything else (a plain Error, an auth/session throw, an empty stream) is a
  // generic outage.
  return 'down';
}
