/**
 * @file AsistenteButton.tsx
 * @description Floating, persistent entry point to the usage assistant. Fixed at
 *   the bottom-right corner, lifted above the mobile bottom nav and the device
 *   safe-area so it never overlaps the tab bar. Opens AsistenteChat.
 *
 *   Visibility gate: shown ONLY to treasury staff (canViewTreasury and NOT
 *   member-only). The edge function rejects member-only users anyway, so we do
 *   not render the button for them. While roles are still loading we render
 *   nothing to avoid a flash for users who will not be allowed.
 *
 *   Accessibility: descriptive aria-label, visible focus ring, and ESC closes
 *   the chat (handled by the underlying Sheet/Dialog primitive). Direction 3
 *   gold styling, motion-safe (press squish is removed under reduced motion via
 *   the shared `.press` utility).
 */

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useCanViewTreasury } from '@/hooks/useCanViewTreasury';
import { useIsMemberOnly } from '@/hooks/useIsMemberOnly';
import { AsistenteChat } from './AsistenteChat';

export function AsistenteButton() {
  const [open, setOpen] = useState(false);
  const { canViewTreasury, isLoading: loadingTreasury } = useCanViewTreasury();
  const { isMemberOnly, isLoading: loadingMemberOnly } = useIsMemberOnly();

  // Do not render until roles resolve, then only for treasury staff. Member-only
  // users never see it (the function would reject them).
  if (loadingTreasury || loadingMemberOnly) return null;
  if (!canViewTreasury || isMemberOnly) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir el asistente: cómo hago las cosas en la app"
        title="¿Cómo hago...?"
        className={cn(
          'press fixed right-4 z-40 flex items-center gap-2 rounded-full',
          'gradient-primary text-primary-foreground shadow-lg',
          'px-4 py-3 text-sm font-medium',
          'transition-shadow hover:shadow-xl',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          // Sit above the mobile bottom nav plus the safe-area inset; on md+
          // there is no bottom nav, so drop the button closer to the corner.
          'bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] md:bottom-6',
        )}
      >
        <HelpCircle className="h-5 w-5" aria-hidden="true" />
        <span>¿Cómo hago...?</span>
      </button>

      <AsistenteChat open={open} onOpenChange={setOpen} />
    </>
  );
}
