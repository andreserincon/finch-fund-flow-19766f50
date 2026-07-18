/**
 * @file TermTooltip.tsx
 * @description Point-of-use glossary explainer for insider jargon. Wraps a
 *   label or header with a quiet dotted-underline cue plus a small info icon,
 *   and reveals a short Spanish definition. Built on the shadcn Popover so it
 *   works on hover (desktop) AND tap/click (mobile), where a Radix Tooltip
 *   alone would never open. Keep the copy to one sentence; this is meant to
 *   stay calm and institutional, not loud.
 *
 *   Usage:
 *     <TermTooltip termKey="cvs">CVS</TermTooltip>
 *   or with explicit text:
 *     <TermTooltip definition="...">Etiqueta</TermTooltip>
 */
import * as React from 'react';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface TermTooltipProps {
  /** Glossary key under the `glossary` namespace (es.ts). */
  termKey?: string;
  /** Explicit definition text, overrides termKey when provided. */
  definition?: string;
  /** The visible label/header the cue decorates. */
  children: React.ReactNode;
  /** Extra classes for the trigger (the underlined text + icon). */
  className?: string;
  /** Hide the small info icon, keeping only the dotted underline cue. */
  hideIcon?: boolean;
  /**
   * Which side the popover opens toward. Defaults to "top" so every existing
   * call site is unchanged; a column header inside a horizontally scrolling
   * container passes "bottom" so the popover is not clipped by the scroll box.
   */
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function TermTooltip({
  termKey,
  definition,
  children,
  className,
  hideIcon = false,
  side = 'top',
}: TermTooltipProps) {
  const { t } = useTranslation();
  const text = definition ?? (termKey ? t(`glossary.${termKey}`) : '');
  const [open, setOpen] = React.useState(false);

  // A short grace period so moving the pointer from the trigger across the gap
  // into the content does not close the popover mid-flight. Hovering EITHER the
  // trigger or the content keeps it open; leaving both closes it after the
  // delay. Tap/click still toggles (mobile), and outside-click / Escape still
  // close it via the Popover root.
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const openNow = () => {
    cancelClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  React.useEffect(() => cancelClose, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          // A tap reveals the definition; hover/focus do too on desktop.
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
          onFocus={openNow}
          onBlur={scheduleClose}
          aria-label={typeof children === 'string' ? `${children}: ${text}` : text}
          className={cn(
            'inline-flex items-center gap-0.5 text-left underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
            className,
          )}
        >
          <span>{children}</span>
          {!hideIcon && (
            <Info className="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        className="w-64 p-3 text-xs leading-relaxed text-popover-foreground motion-reduce:animate-none"
        // Keep it open while the pointer is over the content; close shortly
        // after it leaves.
        onMouseEnter={openNow}
        onMouseLeave={scheduleClose}
        // On touch the trigger keeps focus; let a second tap outside close it.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {text}
      </PopoverContent>
    </Popover>
  );
}
