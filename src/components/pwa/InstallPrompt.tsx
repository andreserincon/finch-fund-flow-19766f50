/**
 * @file InstallPrompt.tsx
 * @description Floating banner that prompts mobile users to install
 *   the app as a PWA. Appears only when the browser supports
 *   installation and the app is not already installed.
 *   Can be dismissed; re-appears on next page load.
 */

import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { useState } from "react";

export function InstallPrompt() {
  const { isInstallable, isInstalled, installApp } = usePWAInstall();
  /** Local state – user dismissed the prompt for this session */
  const [dismissed, setDismissed] = useState(false);

  // Don't render if not installable, already installed, or dismissed
  if (!isInstallable || isInstalled || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-card border border-border rounded-lg shadow-lg p-4 z-50 animate-in slide-in-from-bottom-4">
      {/* Dismiss button */}
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary/10 rounded-lg shrink-0">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm">Install Lodge Compass</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Add to your home screen for quick access
          </p>
          <Button onClick={installApp} size="sm" className="mt-3 w-full">
            Install App
          </Button>
        </div>
      </div>
    </div>
  );
}
