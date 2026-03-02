/**
 * @file MainLayout.tsx
 * @description Shared layout shell used by all authenticated routes.
 *   Renders the sidebar, top toolbar (with sidebar trigger, orientation
 *   toggle, and language switcher), and the main content area.
 */

import { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useOrientationToggle } from '@/hooks/useOrientationToggle';
import { useIsMobile } from '@/hooks/use-mobile';
import { RotateCcw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MainLayoutProps {
  children: ReactNode;
}

/**
 * MainLayout – wraps every protected page with:
 *  - Collapsible sidebar navigation (AppSidebar)
 *  - Sticky top bar with sidebar trigger + utility buttons
 *  - Scrollable content area with responsive padding
 */
export function MainLayout({ children }: MainLayoutProps) {
  const { t } = useTranslation();
  const { isLandscape, toggle } = useOrientationToggle();
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        {/* ── Sidebar navigation ── */}
        <AppSidebar />

        {/* ── Main content area ── */}
        <main className="flex-1 overflow-auto min-w-0">
          {/* Sticky top toolbar */}
          <div className="sticky top-0 z-10 flex h-14 landscape:h-11 items-center justify-between gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <div className="flex items-center gap-4">
              {/* Hamburger / sidebar trigger */}
              <SidebarTrigger className="-ml-2" />
              {/* Mobile-only heading */}
              <h2 className="font-semibold text-lg md:hidden">{t('nav.treasury')}</h2>
            </div>

            <div className="flex items-center gap-2">
              {/* Orientation toggle button (mobile only) */}
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggle}
                  className="text-muted-foreground hover:text-foreground"
                  title={isLandscape ? 'Portrait' : 'Landscape'}
                >
                  {isLandscape ? <Smartphone className="h-5 w-5" /> : <RotateCcw className="h-5 w-5" />}
                </Button>
              )}
              {/* Language switcher (EN / ES) */}
              <LanguageSwitcher />
            </div>
          </div>

          {/* Page content */}
          <div className="p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
