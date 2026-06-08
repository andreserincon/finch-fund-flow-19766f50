/**
 * @file LodgeLoader.tsx
 * @description The lodge loading animation: the gold sunrays spinning. Replaces
 *   the old "Cargando..." text gates. Pass a label only when extra context
 *   helps; otherwise the spinning rays alone read as "loading".
 */
import { cn } from '@/lib/utils';
import { RaysMark } from '@/components/lodge/LodgeMarks';

export function LodgeLoader({
  className,
  label,
  size = 40,
}: {
  className?: string;
  label?: string;
  size?: number;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-10', className)}>
      <span className="text-primary" style={{ width: size, height: size }} aria-label="Cargando">
        <RaysMark count={48} className="rays-loader h-full w-full" />
      </span>
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}
