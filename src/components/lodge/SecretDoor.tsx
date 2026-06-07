/**
 * @file SecretDoor.tsx
 * @description The hidden entrance to the reserved area. There is no visible
 *   "members" button. Tapping or clicking the golden sun three times (within
 *   a short window) opens the door: a brief door-opening animation plays, then
 *   the app navigates to the login (or straight into the reserved area if a
 *   session already exists). A visually hidden, keyboard-focusable fallback
 *   link is provided for assistive technology and keyboard users.
 *
 *   Biometric unlock is intentionally deferred to a later phase (it needs
 *   WebAuthn plus Supabase registration). For now the door leads to the
 *   password login when no session is present.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { RaysMark } from './LodgeMarks';

const TAP_WINDOW_MS = 1200;
const TAPS_REQUIRED = 3;
const DOOR_MS = 900;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The door-opening overlay: two panels part to reveal a gold light. */
function DoorReveal() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className={`door-overlay${open ? ' open' : ''}`} aria-hidden="true">
      <div className="door-panel door-left" />
      <div className="door-panel door-right" />
      <div className="door-glow" />
    </div>
  );
}

interface SecretDoorProps {
  /** Pixel size of the tappable sun. */
  size?: number;
  /** Slowly rotate the rays. */
  spin?: boolean;
  className?: string;
}

export function SecretDoor({ size = 120, spin = true, className }: SecretDoorProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const taps = useRef<number[]>([]);
  const timer = useRef<number | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const enter = useCallback(() => {
    if (opening) return;
    const destination = user ? '/home' : '/auth';
    if (prefersReducedMotion()) {
      navigate(destination);
      return;
    }
    setOpening(true);
    timer.current = window.setTimeout(() => navigate(destination), DOOR_MS);
  }, [opening, user, navigate]);

  const registerTap = useCallback(() => {
    const now = Date.now();
    taps.current = taps.current.filter((t) => now - t < TAP_WINDOW_MS);
    taps.current.push(now);
    if (taps.current.length >= TAPS_REQUIRED) {
      taps.current = [];
      enter();
    }
  }, [enter]);

  return (
    <div className={className} style={{ position: 'relative', width: size, height: size }}>
      <button
        type="button"
        onClick={registerTap}
        aria-hidden="true"
        tabIndex={-1}
        className="text-[#C8A24B]"
        style={{
          width: size,
          height: size,
          background: 'none',
          border: 0,
          padding: 0,
          cursor: 'default',
          display: 'block',
        }}
      >
        <RaysMark spin={spin} className="h-full w-full" />
      </button>

      {/* Discreet accessible fallback: invisible, but reachable by keyboard and
          screen readers so the reserved area is never unreachable. */}
      <button
        type="button"
        onClick={enter}
        className="sr-only focus:not-sr-only focus:absolute focus:left-1/2 focus:top-full focus:-translate-x-1/2 focus:mt-4 focus:rounded focus:border focus:border-[#C8A24B]/50 focus:bg-[#0B0B0D] focus:px-4 focus:py-2 focus:text-xs focus:tracking-[0.18em] focus:text-[#C8A24B]"
      >
        Acceder al área reservada
      </button>

      {opening && <DoorReveal />}
    </div>
  );
}
