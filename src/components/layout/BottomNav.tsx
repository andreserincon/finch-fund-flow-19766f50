/**
 * @file BottomNav.tsx
 * @description Mobile-only bottom tab bar. Surfaces the treasurer's core
 *   on-the-go jobs (dashboard, members, a central "Registrar", reminders/library)
 *   within thumb reach. Hidden on md+ where the sidebar carries navigation.
 *   Role-gated with the same hooks as AppSidebar. Honors the bottom safe-area.
 */
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  BookOpen,
  Plus,
  PlusCircle,
  Wallet,
  ArrowLeftRight,
} from 'lucide-react';
import { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { cn } from '@/lib/utils';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useCanViewTreasury } from '@/hooks/useCanViewTreasury';
import { useIsMemberOnly } from '@/hooks/useIsMemberOnly';
import { usePaymentReminders } from '@/hooks/usePaymentReminders';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const tabClass =
  'press flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[52px] px-1 text-[11px] font-medium text-muted-foreground';

interface Tab {
  to: string;
  end?: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  dot?: boolean;
}

function TabLink({ to, end, icon: Icon, label, dot }: Tab) {
  return (
    <NavLink to={to} end={end} className={tabClass} activeClassName="text-primary-strong">
      <span className="relative">
        <Icon className="h-5 w-5" />
        {dot && (
          <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-overdue" />
        )}
      </span>
      <span className="truncate max-w-[72px]">{label}</span>
    </NavLink>
  );
}

export function BottomNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();
  const { canViewTreasury } = useCanViewTreasury();
  const { isMemberOnly } = useIsMemberOnly();

  const now = new Date();
  const { reminders } = usePaymentReminders({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const pending = reminders.filter((r) => r.status === 'pending_review').length;

  const leftTabs: Tab[] = [
    { to: '/', end: true, icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/members', icon: Users, label: t('nav.members') },
  ].filter(() => canViewTreasury);

  const rightTabs: Tab[] = canViewTreasury && !isMemberOnly
    ? [
        { to: '/recordatorios', icon: MessageSquare, label: t('nav.reminders'), dot: pending > 0 },
        { to: '/library', icon: BookOpen, label: t('nav.library') },
      ]
    : [{ to: '/library', icon: BookOpen, label: t('nav.library') }];

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('dashboard.logTransaction')}
                  className="press -mt-5 flex h-12 w-12 items-center justify-center rounded-full gradient-primary text-primary-foreground shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Plus className="h-6 w-6" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center" className="mb-2 w-52">
                <DropdownMenuItem onClick={() => navigate('/log-payment')}>
                  <PlusCircle className="mr-2 h-4 w-4" /> {t('nav.logPayment')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/log-expense')}>
                  <Wallet className="mr-2 h-4 w-4" /> {t('nav.logExpense')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate('/account-transfer')}>
                  <ArrowLeftRight className="mr-2 h-4 w-4" /> {t('nav.transferFunds')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {rightTabs.map((tab) => (
          <TabLink key={tab.to} {...tab} />
        ))}
      </div>
    </nav>
  );
}
