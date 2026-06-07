/**
 * @file InstallPrompt.tsx
 * @description Floating banner that prompts members to install the app as a
 *   PWA. It is offered ONLY to authenticated users inside the reserved area:
 *   the install event is still captured globally (so it is not missed), but
 *   the banner renders only once a member has logged in. It never appears on
 *   the public landing or the login screen.
 *   Appears only when the browser supports installation and the app is not
 *   already installed. Can be dismissed; re-appears on next page load.
 */

import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";

export function InstallPrompt() {
  const { isInstallable, isInstalled, installApp } = usePWAInstall();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  /** Persisted dismissal, so the prompt never nags again once closed. */
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('pwa-install-dismissed') === '1'; } catch { return false; }
  });
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('pwa-install-dismissed', '1'); } catch { /* ignore */ }
  };

  // "Add to home screen" only makes sense for a logged-in member on a phone.
  // Never show it on desktop/web, when logged out, already installed, or dismissed.
  if (!user || !isMobile || !isInstallable || isInstalled || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-card border border-border rounded-lg shadow-lg p-4 z-50 animate-in slide-in-from-bottom-4">
      {/* Dismiss button */}
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm">Instalar la aplicación</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Agréguela a su pantalla de inicio para un acceso rápido y reservado.
          </p>
          <Button onClick={installApp} size="sm" className="mt-3 w-full">
            Instalar
          </Button>
        </div>
      </div>
    </div>
  );
}
