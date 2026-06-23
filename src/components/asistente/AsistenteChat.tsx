/**
 * @file AsistenteChat.tsx
 * @description Multi-turn, streaming chat surface for the "asistente" (usage
 *   guide). Opens as a bottom sheet on mobile and a side sheet on desktop.
 *
 *   What it does:
 *   - Renders a running conversation (user + assistant turns); assistant text is
 *     rendered as markdown.
 *   - Suggested-question chips when the conversation is empty, derived from
 *     ASISTENTE_TASKS titles.
 *   - Streams from the `asistente` edge function and parses NATIVE ANTHROPIC SSE
 *     (content_block_delta -> delta.text). It does NOT parse OpenAI choices[].
 *
 *   Privacy: the request payload is ONLY { question, turns, kb }. It never ships
 *   balances, members, transactions, or any live app data. `kb` is the static
 *   curated text from buildKbText(); `turns` is prior chat text the user typed
 *   or the assistant produced. No financial data is ever read or sent here.
 *
 *   This is purely additive UI. The full offline / over-cap fallback is S4; here
 *   a failed or non-streaming response shows a single inline error and does not
 *   crash.
 */

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { HelpCircle, Send, Loader2, X } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { ASISTENTE_TASKS, buildKbText } from '@/lib/asistenteKb';

/** A single message kept in the visible conversation. */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Wire shape sent to the edge function. Intentionally minimal: no app data. */
interface AsistentePayload {
  question: string;
  turns: ChatMessage[];
  kb: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const TRUST_NOTE =
  'Soy una guía de uso de la app. Te muestro cómo hacer las cosas; no consulto ni informo saldos ni datos de miembros.';

// Chips offer one phrased question per task title, e.g. "Registrar un pago de
// cápita" -> "¿Cómo registro un pago de cápita?". A small per-task override
// keeps the verb conjugation natural; everything else falls back to the title.
const CHIP_QUESTIONS: Record<string, string> = {
  T1: '¿Cómo registro un pago de cápita?',
  T2: '¿Cómo registro un gasto?',
  T3: '¿Cómo transfiero fondos entre cuentas?',
  T4: '¿Cómo genero el reporte mensual?',
  T5: '¿Cómo calculo las cápitas?',
  T6: '¿Cómo reviso y envío los recordatorios?',
  T7: '¿Cómo doy de alta un miembro?',
  T8: '¿Cómo creo o gestiono un evento?',
};

function chipQuestion(taskId: string, title: string): string {
  return CHIP_QUESTIONS[taskId] ?? `¿Cómo: ${title}?`;
}

interface AsistenteChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AsistenteChat({ open, onOpenChange }: AsistenteChatProps) {
  // The committed conversation (completed turns only).
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // The assistant message currently streaming in, separate from `messages` so
  // we can append to it token by token without re-committing the whole list.
  const [streaming, setStreaming] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTrustNote, setShowTrustNote] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view as content streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, error]);

  const isEmpty = messages.length === 0 && streaming === null && !isLoading;

  const send = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || isLoading) return;

    setError(null);
    setInput('');

    // Prior turns are everything already committed. We send these so the model
    // has follow-up context; they are user/assistant TEXT only.
    const priorTurns = messages.map((m) => ({ role: m.role, content: m.content }));

    // Show the user's message immediately.
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setStreaming('');
    setIsLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Tu sesión expiró. Volvé a iniciar sesión.');
      }

      const payload: AsistentePayload = {
        question,
        turns: priorTurns,
        kb: buildKbText(),
      };

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/asistente`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!resp.ok || !resp.body) {
        throw new Error('No pude conectar con el asistente. Probá de nuevo en un momento.');
      }

      // Parse NATIVE ANTHROPIC SSE. Each event arrives as one or more lines; the
      // payload lines start with "data: " and carry a JSON object whose `type`
      // tells us what it is. We only care about content_block_delta with a
      // text_delta; we ignore message_start / content_block_start /
      // message_delta / message_stop / ping and any other event types.
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let assistantText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          // SSE comments (": ...", used for ping keep-alives) and blank lines.
          if (line.startsWith(':') || line.trim() === '') continue;
          // Native Anthropic SSE also emits "event: <name>" lines; the JSON is
          // on the "data:" line, so we read that one only.
          if (!line.startsWith('data:')) continue;

          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const obj = JSON.parse(jsonStr);
            if (
              obj.type === 'content_block_delta' &&
              obj.delta?.type === 'text_delta' &&
              typeof obj.delta.text === 'string'
            ) {
              assistantText += obj.delta.text;
              setStreaming(assistantText);
            }
            // All other event types (message_start, content_block_start,
            // content_block_stop, message_delta, message_stop, ping, error) are
            // intentionally ignored for the visible stream.
          } catch {
            // A partial JSON line at a chunk boundary: put it back and wait for
            // more bytes before trying to parse again.
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      if (assistantText.trim() === '') {
        // Streamed but produced nothing usable.
        throw new Error('El asistente no devolvió una respuesta. Probá de nuevo.');
      }

      // Commit the finished assistant turn so it becomes part of `turns` for the
      // next follow-up question.
      setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error con el asistente. Probá de nuevo.',
      );
    } finally {
      setStreaming(null);
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          'flex flex-col gap-0 p-0',
          // Bottom sheet on mobile; a comfortable side panel on desktop.
          'h-[85dvh] rounded-t-2xl',
          'sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl sm:border-l',
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Header */}
        <SheetHeader className="space-y-0 border-b border-border px-4 py-3 text-left">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <HelpCircle className="h-4 w-4" />
            </span>
            <SheetTitle className="section-title text-base">Asistente</SheetTitle>
          </div>
        </SheetHeader>

        {/* Trust note (dismissible) */}
        {showTrustNote && (
          <div className="flex items-start gap-2 border-b border-border bg-accent/40 px-4 py-2.5 text-xs text-muted-foreground">
            <p className="flex-1 leading-relaxed">{TRUST_NOTE}</p>
            <button
              type="button"
              onClick={() => setShowTrustNote(false)}
              aria-label="Cerrar el aviso"
              className="press -mr-1 mt-0.5 rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Message list */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4"
          aria-live="polite"
        >
          {isEmpty ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Preguntame cómo hacer algo en la app. Por ejemplo:
              </p>
              <div className="flex flex-wrap gap-2">
                {ASISTENTE_TASKS.map((task) => {
                  const q = chipQuestion(task.id, task.title);
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => send(q)}
                      className="press rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {q}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m, i) => (
                <MessageBubble key={i} role={m.role} content={m.content} />
              ))}

              {/* The in-progress assistant message. */}
              {streaming !== null && (
                <div className="flex justify-start">
                  <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-muted/60 px-3.5 py-2.5 text-sm">
                    {streaming === '' ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                        Escribiendo...
                      </span>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none break-words">
                        <ReactMarkdown>{streaming}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-border px-4 py-3"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribí tu pregunta..."
            aria-label="Escribí tu pregunta para el asistente"
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || input.trim() === ''}
            aria-label="Enviar pregunta"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** A committed user or assistant message. Assistant text renders as markdown. */
function MessageBubble({ role, content }: ChatMessage) {
  const isUser = role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[88%] px-3.5 py-2.5 text-sm',
          isUser
            ? 'rounded-2xl rounded-tr-sm bg-primary text-primary-foreground'
            : 'rounded-2xl rounded-tl-sm bg-muted/60 text-foreground',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
