/**
 * @file LodgeMarks.tsx
 * @description Shared lodge emblem FRAGMENTS rendered as inline SVG. The full
 *   official emblem is never shown; only the radiating rays, the Andean
 *   mountains, and the official square and compass are used. All in gold via
 *   currentColor so callers control the tone.
 */

interface MarkProps {
  className?: string;
}

/** The radiating sunburst rays (a fragment of the emblem, never the whole). */
export function RaysMark({ className, spin = false, count = 72 }: MarkProps & { spin?: boolean; count?: number }) {
  const lines = Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    const isLong = i % 2 === 0;
    const rIn = 14;
    const rOut = isLong ? 104 : 104 * 0.72;
    return (
      <line
        key={i}
        x1={(Math.cos(a) * rIn).toFixed(2)}
        y1={(Math.sin(a) * rIn).toFixed(2)}
        x2={(Math.cos(a) * rOut).toFixed(2)}
        y2={(Math.sin(a) * rOut).toFixed(2)}
        stroke="currentColor"
        strokeWidth={isLong ? 0.8 : 0.6}
        strokeLinecap="round"
        opacity={isLong ? 0.92 : 0.5}
        strokeDasharray={isLong ? undefined : '2.5 4.5'}
      />
    );
  });
  return (
    <svg
      viewBox="-110 -110 220 220"
      className={[className, spin ? 'rays-spin' : ''].filter(Boolean).join(' ')}
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      {lines}
    </svg>
  );
}

/** Andean mountain silhouette with a gold ridge, full bleed at the bottom. */
export function MountainRidge({ className }: MarkProps) {
  return (
    <svg viewBox="0 0 1440 360" preserveAspectRatio="none" className={className} aria-hidden="true">
      <path
        d="M0,360 L0,278 L180,210 L340,250 L500,150 L680,205 L860,128 L1040,198 L1220,160 L1380,216 L1440,200 L1440,360 Z"
        fill="#101012"
      />
      <path
        d="M0,360 L0,300 L130,250 L260,286 L420,172 L520,224 L640,150 L700,116 L772,162 L880,214 L1030,182 L1180,256 L1300,210 L1440,246 L1440,360 Z"
        fill="#060607"
      />
      <path
        d="M0,300 L130,250 L260,286 L420,172 L520,224 L640,150 L700,116 L772,162 L880,214 L1030,182 L1180,256 L1300,210 L1440,246"
        fill="none"
        stroke="#C8A24B"
        strokeWidth={1.2}
        strokeOpacity={0.42}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The official square and compass, a single gold hairline outline (no G). */
export function SquareCompass({ className }: MarkProps) {
  return (
    <svg
      viewBox="-50 -50 100 100"
      className={className}
      role="img"
      aria-label="Escuadra y compás, símbolo masónico"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="0" cy="-40" r="3.4" fill="currentColor" stroke="none" />
      <path d="M0,-38 L-26,20 M0,-38 L26,20" />
      <path d="M-26,20 L-21.5,15.5 M26,20 L21.5,15.5" />
      <path d="M-34,6 L0,40 L34,6" />
    </svg>
  );
}
