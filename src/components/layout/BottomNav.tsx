/**
 * @file BottomNav.tsx
 * @description Mobile-only bottom tab bar. Surfaces the treasurer's core
 *   on-the-go jobs (dashboard, members, a central "Registrar", reminders/library)
 *   within thumb reach. Hidden on md+ where the sidebar carries navigation.
 *   Role-gated with the same hooks as AppSidebar. Honors the bottom safe-area.
 */
import { Home, Users, MessageSquare, BookOpen, Receipt, Plus } from 'lucide-react';
import { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from '@/components/NavLink';
import { cn } from '@/lib/utils';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useCanViewTreasury } from '@/hooks/useCanViewTreasury';
import { useIsMemberOnly } from '@/hooks/useIsMemberOnly';
import { usePaymentReminders } from '@/hooks/usePaymentReminders';
import { AddTransactionForm } from '@/components/forms/AddTransactionForm';

const tabClass =
  'press flex flex-1 items-center justify-center min-h-[52px] px-1 text-muted-foreground';

interface Tab {
  to: string;
  end?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  dot?: boolean;
}

function TabLink({ to, end, icon: Icon, label, dot }: Tab) {
  return (
    <NavLink to={to} end={end} className={tabClass} activeClassName="text-primary-strong" aria-label={label} title={label}>
      <span className="relative">
        <Icon className="h-6 w-6" />
        {dot && (
          <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-overdue" />
        )}
      </span>
    </NavLink>
  );
}

export function BottomNav() {
  const { t } = useTranslation();
  const { isAdmin } = useIsAdmin();
  const { canViewTreasury } = useCanViewTreasury();
  const { isMemberOnly } = useIsMemberOnly();

  const now = new Date();
  const { reminders } = usePaymentReminders({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const pending = reminders.filter((r) => r.status === 'pending_review').length;

  const leftTabs: Tab[] = [
    { to: '/home', end: true, icon: Home, label: t('nav.home') },
    { to: '/members', icon: Users, label: t('nav.members') },
  ].filter(() => canViewTreasury);

  const rightTabs: Tab[] = canViewTreasury && !isMemberOnly
    ? [
        { to: '/recordatorios', icon: MessageSquare, label: t('nav.reminders'), dot: pending > 0 },
        { to: '/transactions', icon: Receipt, label: t('nav.transactions') },
      ]
    : [
        { to: '/mis-pagos', icon: Receipt, label: 'Mis pagos' },
        { to: '/library', icon: BookOpen, label: t('nav.library') },
      ];

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label={t('nav.treasury')}
    >
      <div className="flex items-stretch">
        {leftTabs.map((tab) => (
          <TabLink key={tab.to} {...tab} />
        ))}

        {isAdmin && (
          <div className="flex flex-1 items-center justify-center">
            <AddTransactionForm
              trigger={
                <button
                  type="button"
                  aria-label={t('dashboard.logTransaction')}
                  className="press -mt-5 flex h-12 w-12 items-center justify-center rounded-full gradient-primary text-primary-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-6 w-6" />
                </button>
              }
            />
          </div>
        )}

        {rightTabs.map((tab) => (
          <TabLink key={tab.to} {...tab} />
        ))}
      </div>
    </nav>
  );
}
