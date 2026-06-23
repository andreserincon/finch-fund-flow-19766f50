/**
 * @file AsistenteTourContext.tsx
 * @description Hosts the guided-tour runner ONCE, above the routes, so a tour
 *   survives the route change it triggers.
 *
 *   Why this exists: each authenticated route renders its OWN MainLayout (see
 *   App.tsx: /home -> ProtectedRoute>MainLayout, /log-payment ->
 *   AdminRoute>MainLayout). AsistenteButton + AsistenteChat live inside
 *   MainLayout, so navigating from one screen to another unmounts the chat and
 *   mounts a fresh one. If the driver.js runner lived in the chat, the tour's
 *   own navigation to the target screen would unmount the runner and destroy the
 *   driver instance before it could spotlight anything. Mounting the runner here,
 *   wrapping <Routes>, keeps the driver instance and the step loop alive across
 *   the navigation. The chat just triggers start() through this context.
 *
 *   Must be rendered INSIDE <BrowserRouter> (the runner uses useNavigate).
 */

import { createContext, useContext, type ReactNode } from 'react';
import {
  useAsistenteTour,
  type AsistenteTourController,
} from '@/hooks/useAsistenteTour';

const AsistenteTourContext = createContext<AsistenteTourController | null>(null);

export function AsistenteTourProvider({ children }: { children: ReactNode }) {
  const controller = useAsistenteTour();
  return (
    <AsistenteTourContext.Provider value={controller}>
      {children}
    </AsistenteTourContext.Provider>
  );
}

/**
 * Access the shared tour controller. Falls back to a no-op controller if used
 * outside the provider (defensive only; the provider wraps every route).
 */
export function useAsistenteTourController(): AsistenteTourController {
  const ctx = useContext(AsistenteTourContext);
  if (!ctx) {
    return { start: () => undefined, stop: () => undefined };
  }
  return ctx;
}
