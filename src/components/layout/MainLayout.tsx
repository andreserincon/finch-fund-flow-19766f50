/**
 * @file MainLayout.tsx
 * @description Shared layout shell used by all authenticated routes.
 *   Renders the sidebar, a sticky top toolbar (sidebar trigger + hidden-mode
 *   toggle), a mobile bottom navigation bar, and the main content area.
 *   Honors the device safe-area insets (notch / home indicator).
 */

import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { BottomNav } from './BottomNav';
import { useHiddenMode } from '@/contexts/HiddenModeContext';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MainLayoutProps {
  children: ReactNode;
}

/**
 * MainLayout - wraps every protected page with:
 *  - Collapsible sidebar navigation (AppSidebar), an off-canvas drawer on mobile
 *  - Sticky top bar with sidebar trigger + the hidden-mode toggle
 *  - A mobile-only bottom navigation bar (BottomNav)
 *  - Scrollable content area with responsive + safe-area padding
 */
export function MainLayout({ children }: MainLayoutProps) {
  const { t } = useTranslation();
  const { hiddenMode, toggleHiddenMode } = useHiddenMode();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        {/* Sidebar navigation (off-canvas drawer on mobile) */}
        <AppSidebar />

        {/* Main content area */}
        <main className="flex-1 overflow-auto min-w-0">
          {/* Sticky top toolbar, padded for the top safe-area inset */}
          <header
            className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
          >
            <div className="flex h-14 landscape:h-11 items-center justify-between gap-4 px-4 md:px-6">
              <div className="flex items-center gap-4">
                {/* Hamburger / sidebar trigger */}
                <SidebarTrigger className="-ml-2" aria-label={t('nav.toggleSidebar', 'Abrir o cerrar el menú')} />
                {/* Mobile-only heading */}
                <h2 className="font-semibold text-lg md:hidden">{t('nav.treasury')}</h2>
              </div>

              <div className="flex items-center gap-3">
                {/* Hidden mode toggle: a labelled pill that tints when active */}
                <button
                  type="button"
                  onClick={toggleHiddenMode}
                  aria-pressed={hiddenMode}
                  aria-label={t('nav.hiddenModeLabel', 'Ocultar nombres')}
                  title={t('nav.hiddenModeHint', 'Oculta los nombres de los miembros')}
                  className={cn(
                    'press flex items-center gap-2 rounded-full border px-2.5 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    hiddenMode
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  {hiddenMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {/* Clearer label on roomier screens; collapses to icon-only on
                      mobile, where the aria-label and title still convey it. */}
                  <span className="hidden text-xs font-medium sm:inline">
                    {t('nav.hiddenModeLabel', 'Ocultar nombres')}
                  </span>
                </button>
              </div>
            </div>
          </header>

          {/* Page content. Extra bottom padding on mobile clears the bottom nav. */}
          <div className="p-4 md:p-6 pb-24 md:pb-6">
            {children}
          </div>
        </main>

        {/* Mobile bottom navigation */}
        <BottomNav />
      </div>
    </SidebarProvider>
  );
}
