/**
 * @file loading.tsx
 * @description Composite skeleton loaders built on the base Skeleton primitive.
 *   These replace the old full-area "Cargando..." text gates so structure
 *   appears instantly and content fills in. Low, functional motion only.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** A grid of stat-card placeholders matching the dashboard balance row. */
export function StatGridSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-3 grid-cols-2 lg:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat-card space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

/** A bordered table placeholder with a header row and N body rows. */
export function TableSkeleton({
  rows = 6,
  cols = 5,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border bg-card overflow-hidden', className)}>
      <div className="flex items-center gap-4 border-b px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={cn('h-3 flex-1', i === 0 && 'max-w-[36%]')} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-border/50 px-4 py-3.5 last:border-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn('h-4 flex-1', c === 0 && 'max-w-[36%]')} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full dashboard skeleton: an alert banner, a balance row, and a table. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 md:space-y-8">
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-44" />
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <StatGridSkeleton count={3} className="lg:grid-cols-3" />
      <TableSkeleton rows={5} cols={4} />
    </div>
  );
}
