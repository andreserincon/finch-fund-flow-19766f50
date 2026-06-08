/**
 * @file useParallax.ts
 * @description Attaches a subtle scroll parallax to a single element: as the
 *   page scrolls, the element drifts vertically at a fraction of the scroll
 *   distance, giving a sense of depth. Built for the Andean mountain ridge on
 *   the public landing hero. Honors prefers-reduced-motion (stays static),
 *   runs off a passive scroll listener with a requestAnimationFrame guard, and
 *   never triggers a React re-render (the transform is written imperatively).
 */

import { useEffect, useRef, type RefObject } from 'react';

export interface ParallaxOptions {
  /** Fraction of scrollY turned into vertical drift, in px per px. Default 0.2. Positive drifts the element down as the page scrolls down. */
  speed?: number;
  /** Optional clamp on the absolute drift, in px. */
  max?: number;
  /** Stay static below this viewport width, in px. Default 0 (never disabled by width). */
  minWidth?: number;
}

export function useParallax<T extends HTMLElement = HTMLDivElement>(
  options: ParallaxOptions = {},
): RefObject<T> {
  const { speed = 0.2, max, minWidth = 0 } = options;
  const ref = useRef<T>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let rafId = 0;
    let ticking = false;
    let running = false;

    // Read only the cheap cached scrollY here; never measure layout in this
    // write phase, so the scroll handler cannot thrash.
    const apply = () => {
      ticking = false;
      const el = ref.current;
      if (!el) return;
      let y = window.scrollY * speed;
      if (max != null) y = Math.max(-max, Math.min(max, y));
      el.style.transform = `translate3d(0, ${y}px, 0)`;
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        rafId = window.requestAnimationFrame(apply);
      }
    };

    const enable = () => {
      window.addEventListener('scroll', onScroll, { passive: true });
      // Apply once so a refresh mid-page renders at the correct offset.
      apply();
    };

    const disable = () => {
      window.removeEventListener('scroll', onScroll);
      window.cancelAnimationFrame(rafId);
      // Restore the original static layout exactly.
      if (ref.current) ref.current.style.transform = '';
    };

    const shouldRun = () => !reduceMq.matches && window.innerWidth >= minWidth;

    const decide = () => {
      const next = shouldRun();
      if (next === running) return;
      running = next;
      if (next) enable();
      else disable();
    };

    decide();
    reduceMq.addEventListener?.('change', decide);
    const onResize = minWidth > 0 ? () => decide() : null;
    if (onResize) window.addEventListener('resize', onResize, { passive: true });

    return () => {
      disable();
      running = false;
      reduceMq.removeEventListener?.('change', decide);
      if (onResize) window.removeEventListener('resize', onResize);
    };
  }, [speed, max, minWidth]);

  return ref;
}
