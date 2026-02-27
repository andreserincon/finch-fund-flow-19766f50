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

export function MainLayout({ children }: MainLayoutProps) {
  const { t } = useTranslation();
  const { isLandscape, toggle } = useOrientationToggle();
  const isMobile = useIsMobile();

  return (
    <SidebarProvider>
      <div
        className={`min-h-screen flex w-full bg-background transition-transform duration-300 ${
          isLandscape && isMobile
            ? 'fixed inset-0 origin-top-left rotate-90 w-screen h-screen'
            : ''
        }`}
        style={
          isLandscape && isMobile
            ? { width: '100vh', height: '100vw', transformOrigin: 'top left', transform: 'rotate(90deg) translateY(-100%)' }
            : undefined
        }
      >
        <AppSidebar />
        <main className="flex-1 overflow-auto min-w-0">
          <div className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="-ml-2" />
              <h2 className="font-semibold text-lg md:hidden">{t('nav.treasury')}</h2>
            </div>
            <div className="flex items-center gap-2">
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
              <LanguageSwitcher />
            </div>
          </div>
          <div className="p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
