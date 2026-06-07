/**
 * @file SecretDoor.tsx
 * @description The hidden entrance to the reserved area. There is no visible
 *   "members" button. The way in is the golden sun: it must be clicked or
 *   tapped EXACTLY three times. After the last click the component waits a
 *   beat to be sure no further clicks arrive; only then, if the total was
 *   exactly three, does the door open. Two, four, or five clicks do nothing.
 *
 *   When the door opens, a brief door-opening animation plays, then the app
 *   navigates to the login (or straight into the reserved area if a session
 *   already exists). A visually hidden, keyboard-focusable fallback link is
 *   provided for assistive technology and keyboard users.
 *
 *   Biometric unlock is intentionally deferred to a later phase (it needs
 *   WebAuthn plus Supabase registration). For now the door leads to the
 *   password login when no session is present.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { RaysMark } from './LodgeMarks';

const REQUIRED_CLICKS = 3;
/** Wait this long after the LAST click before deciding, so extra clicks count. */
const SETTLE_MS = 900;
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
  /** Size of the tappable sun. A number is treated as px; a string is used as-is (e.g. "120vmin"). */
  size?: number | string;
  /** Opacity of the rays (the original hero burst is faint). */
  dim?: number;
  /** Slowly rotate the rays. */
  spin?: boolean;
  className?: string;
}

export function SecretDoor({ size = 120, dim = 1, spin = true, className }: SecretDoorProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const count = useRef(0);
  const settle = useRef<number | null>(null);
  const doorTimer = useRef<number | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => () => {
    if (settle.current) window.clearTimeout(settle.current);
    if (doorTimer.current) window.clearTimeout(doorTimer.current);
  }, []);

  const enter = useCallback(() => {
    if (opening) return;
    const destination = user ? '/home' : '/auth';
    if (prefersReducedMotion()) {
      navigate(destination);
      return;
    }
    setOpening(true);
    doorTimer.current = window.setTimeout(() => navigate(destination), DOOR_MS);
  }, [opening, user, navigate]);

  const registerClick = useCallback(() => {
    if (opening) return;
    count.current += 1;
    if (settle.current) window.clearTimeout(settle.current);
    // Wait until the clicks stop, then require EXACTLY three.
    settle.current = window.setTimeout(() => {
      if (count.current === REQUIRED_CLICKS) {
        enter();
      }
      count.current = 0;
    }, SETTLE_MS);
  }, [opening, enter]);

  const dimension = typeof size === 'number' ? `${size}px` : size;

  return (
    <div className={className} style={{ position: 'relative', width: dimension, height: dimension }}>
      <button
        type="button"
        onClick={registerClick}
        aria-hidden="true"
        tabIndex={-1}
        className="text-[#C8A24B]"
        style={{
          width: '100%',
          height: '100%',
          background: 'none',
          border: 0,
          padding: 0,
          cursor: 'default',
          display: 'block',
          opacity: dim,
        }}
      >
        <RaysMark spin={spin} className="h-full w-full" />
      </button>

      {/* Discreet accessible fallback: invisible, but reachable by keyboard and
          screen readers so the reserved area is never unreachable. */}
      <button
        type="button"
        onClick={enter}
        className="sr-only focus:not-sr-only focus:absolute focus:left-1/2 focus:top-full focus:z-20 focus:-translate-x-1/2 focus:mt-4 focus:whitespace-nowrap focus:rounded focus:border focus:border-[#C8A24B]/50 focus:bg-[#0B0B0D] focus:px-4 focus:py-2 focus:text-xs focus:tracking-[0.18em] focus:text-[#C8A24B]"
      >
        Acceder al área reservada
      </button>

      {opening && <DoorReveal />}
    </div>
  );
}
