import { describe, it, expect, afterEach } from 'vitest';

import {
  parseAnthropicSSE,
  parseAnthropicTextDelta,
  buildAsistentePayload,
  classifyAsistenteError,
  AsistenteDegradeError,
  type ChatMessage,
} from '@/lib/asistenteClient';
import { buildKbText } from '@/lib/asistenteKb';

/**
 * Tests for the pure client helpers extracted from AsistenteChat.tsx (Slice 5).
 * These cover the SSE text extraction, the wire payload shape, and the failure
 * classifier. The MODEL's actual output (verbatim refusal, zero figures, answer
 * correctness) is a post-deploy live check, not unit-testable here.
 */

describe('parseAnthropicSSE', () => {
  it('returns exactly the concatenated text from text_delta events', () => {
    // A representative native-Anthropic stream: message_start, content_block_start,
    // two text_delta chunks, a ping, an SSE comment, content_block_stop,
    // message_delta and message_stop. Both "event:" and "data:" lines are present.
    const sse = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_1","role":"assistant"}}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Para registrar "}}',
      '',
      ': ping keep-alive',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"un pago de cápita..."}}',
      '',
      'event: ping',
      'data: {"type":"ping"}',
      '',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n');

    expect(parseAnthropicSSE(sse)).toBe('Para registrar un pago de cápita...');
  });

  it('ignores non-text events and does not throw on ping, comment or blank lines', () => {
    const sse = [
      ': ping',
      '',
      'event: ping',
      'data: {"type":"ping"}',
      '',
      'data: {"type":"message_start","message":{"id":"x"}}',
      '   ',
      'event: message_stop',
      'data: {"type":"message_stop"}',
    ].join('\n');

    // No text_delta events at all -> empty string, and no throw.
    expect(() => parseAnthropicSSE(sse)).not.toThrow();
    expect(parseAnthropicSSE(sse)).toBe('');
  });

  it('tolerates a malformed JSON data line without throwing', () => {
    const sse = [
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok "}}',
      'data: {this is not valid json',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"done"}}',
    ].join('\n');

    expect(() => parseAnthropicSSE(sse)).not.toThrow();
    // The broken line is skipped; the two valid deltas still concatenate.
    expect(parseAnthropicSSE(sse)).toBe('ok done');
  });

  it('handles CRLF line endings', () => {
    const sse =
      'event: content_block_delta\r\n' +
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hola"}}\r\n';
    expect(parseAnthropicSSE(sse)).toBe('hola');
  });

  it('returns empty string for empty input', () => {
    expect(parseAnthropicSSE('')).toBe('');
  });

  it('does NOT treat OpenAI-style choices[].delta.content as text', () => {
    // An OpenAI chunk shape must yield no text from either the per-event parser
    // or the full-stream parser: the asistente parses native Anthropic only.
    const openAiEvent = {
      choices: [{ delta: { content: 'leaked text' } }],
    };
    expect(parseAnthropicTextDelta(openAiEvent)).toBeNull();

    const sse = [
      'data: {"choices":[{"delta":{"content":"leaked text"}}]}',
      'data: [DONE]',
    ].join('\n');
    expect(parseAnthropicSSE(sse)).toBe('');
  });
});

describe('parseAnthropicTextDelta', () => {
  it('returns the text for a content_block_delta/text_delta', () => {
    const ev = {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'chunk' },
    };
    expect(parseAnthropicTextDelta(ev)).toBe('chunk');
  });

  it('returns null for non-text event types', () => {
    expect(parseAnthropicTextDelta({ type: 'message_start' })).toBeNull();
    expect(parseAnthropicTextDelta({ type: 'ping' })).toBeNull();
    expect(parseAnthropicTextDelta({ type: 'content_block_stop', index: 0 })).toBeNull();
  });

  it('returns null for a content_block_delta with a non-text delta', () => {
    const ev = {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{}' },
    };
    expect(parseAnthropicTextDelta(ev)).toBeNull();
  });

  it('returns null for null, undefined and primitive inputs', () => {
    expect(parseAnthropicTextDelta(null)).toBeNull();
    expect(parseAnthropicTextDelta(undefined)).toBeNull();
    expect(parseAnthropicTextDelta('text')).toBeNull();
    expect(parseAnthropicTextDelta(42)).toBeNull();
  });
});

describe('buildAsistentePayload', () => {
  it('returns a body with exactly the keys question, turns, kb', () => {
    const turns: ChatMessage[] = [
      { role: 'user', content: '¿Cómo registro un pago?' },
      { role: 'assistant', content: 'Andá a Registrar Pago...' },
    ];
    const payload = buildAsistentePayload({ question: '¿Y un gasto?', turns });

    // Top-level shape: no extra keys can carry app data.
    expect(Object.keys(payload).sort()).toEqual(['kb', 'question', 'turns']);
    expect(payload.question).toBe('¿Y un gasto?');
    expect(payload.turns).toBe(turns);
  });

  it('uses the static KB text from buildKbText() verbatim', () => {
    const payload = buildAsistentePayload({ question: 'q', turns: [] });
    expect(payload.kb).toBe(buildKbText());
  });

  it('serialized body carries nothing beyond question, turns and the static KB', () => {
    const turns: ChatMessage[] = [{ role: 'user', content: 'hola' }];
    const payload = buildAsistentePayload({ question: 'hola otra vez', turns });

    // Assert the top-level shape (not a naive token scan): the only string
    // content that could include figures is the static KB itself, plus the
    // user-typed question and turns. There is no members/balances/transactions
    // channel in the wire body.
    const parsed = JSON.parse(JSON.stringify(payload));
    expect(Object.keys(parsed).sort()).toEqual(['kb', 'question', 'turns']);
    expect(parsed.kb).toBe(buildKbText());
    expect(parsed.question).toBe('hola otra vez');
    expect(parsed.turns).toEqual(turns);
  });
});

describe('classifyAsistenteError', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(
    window.navigator,
    'onLine',
  );

  afterEach(() => {
    // Restore navigator.onLine after any test that overrode it.
    if (originalOnLine) {
      Object.defineProperty(window.navigator, 'onLine', originalOnLine);
    }
  });

  it('maps an HTTP 429 response to "cap"', () => {
    const resp = new Response('', { status: 429 });
    expect(classifyAsistenteError(resp)).toBe('cap');
  });

  it('maps a status: 429 descriptor to "cap"', () => {
    expect(classifyAsistenteError({ status: 429 })).toBe('cap');
  });

  it('maps a thrown network error (TypeError) to "offline"', () => {
    // fetch rejects with a TypeError when the connection cannot be made.
    const networkError = new TypeError('Failed to fetch');
    expect(classifyAsistenteError(networkError)).toBe('offline');
  });

  it('maps a simulated offline device to "offline"', () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    expect(window.navigator.onLine).toBe(false);
    // The offline descriptor (what the caller derives from navigator.onLine).
    expect(classifyAsistenteError({ offline: true })).toBe('offline');
  });

  it('maps a 500 response to "down"', () => {
    const resp = new Response('', { status: 500 });
    expect(classifyAsistenteError(resp)).toBe('down');
  });

  it('maps a 404 response to "down"', () => {
    const resp = new Response('', { status: 404 });
    expect(classifyAsistenteError(resp)).toBe('down');
  });

  it('maps an empty-stream descriptor to "down"', () => {
    expect(classifyAsistenteError({ emptyStream: true })).toBe('down');
  });

  it('maps a generic thrown Error (e.g. an expired session) to "down"', () => {
    expect(classifyAsistenteError(new Error('Tu sesión expiró.'))).toBe('down');
  });

  it('preserves the reason carried by an AsistenteDegradeError', () => {
    expect(classifyAsistenteError(new AsistenteDegradeError('cap'))).toBe('cap');
    expect(classifyAsistenteError(new AsistenteDegradeError('offline'))).toBe('offline');
    expect(classifyAsistenteError(new AsistenteDegradeError('down'))).toBe('down');
  });
});
