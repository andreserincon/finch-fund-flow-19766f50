/**
 * @file PageHeader.tsx
 * @description Standardized page title block for the treasury screens. Matches
 *   the strong brand look that Inicio (Home) and Detalle financiero (Dashboard)
 *   already use: an h1 in font-display, bold, with an optional muted subtitle
 *   and an optional thin gold hairline under the title. Screens that used plain
 *   shadcn defaults adopt this so the lodge identity stays consistent across the
 *   whole funnel (Calculadora, Presupuesto, Transferencia, Reportes, formularios).
 *
 *   Presentation only: this carries no behavior. The `leading` slot holds a back
 *   button or icon, `actions` holds trailing controls, and the title text and
 *   actions are passed through unchanged from each screen.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  /** The page title. Rendered as the h1 in font-display. */
  title: React.ReactNode;
  /** Optional supporting line under the title, in muted foreground. */
  subtitle?: React.ReactNode;
  /** Optional leading element shown to the left of the title (back link, icon). */
  leading?: React.ReactNode;
  /** Optional trailing controls shown on the right (primary action, menu). */
  actions?: React.ReactNode;
  /** Draw the thin gold hairline under the title (the lodge brand cue). */
  hairline?: boolean;
  /** Extra classes for the outer wrapper. */
  className?: string;
  /** Extra classes for the h1 (e.g. responsive size overrides). */
  titleClassName?: string;
  /** Extra classes for the subtitle paragraph (e.g. landscape:hidden). */
  subtitleClassName?: string;
}

export function PageHeader({
  title,
  subtitle,
  leading,
  actions,
  hairline = false,
  className,
  titleClassName,
  subtitleClassName,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {leading}
        <div className="min-w-0">
          <h1
            className={cn(
              'font-display text-2xl md:text-3xl font-bold text-foreground tracking-tight',
              titleClassName,
            )}
          >
            {title}
          </h1>
          {hairline && <div className="rule-gold mt-2" />}
          {subtitle && (
            <p className={cn('text-sm text-muted-foreground mt-1', subtitleClassName)}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
