/**
 * @file BottomNav.tsx
 * @description Mobile-only bottom tab bar. Surfaces the treasurer's core
 *   on-the-go jobs (dashboard, members, a central "Registrar", reminders/library)
 *   within thumb reach, plus a "Más" tab that opens a sheet with the off-bar
 *   treasury destinations and the workspace switcher. Hidden on md+ where the
 *   sidebar carries navigation. Role-gated with the same hooks as AppSidebar.
 *   Honors the bottom safe-area.
 */
import {
  Home, Users, MessageSquare, BookOpen, Receipt, Plus, MoreHorizontal,
  LayoutDashboard, HandCoins, FileText, PieChart, Settings, Wallet, Calculator,
  UserCog,
} from 'lucide-react';
import { ComponentType, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { cn } from '@/lib/utils';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { useCanManageUsers } from '@/hooks/useCanManageUsers';
import { useCanViewTreasury } from '@/hooks/useCanViewTreasury';
import { useIsMemberOnly } from '@/hooks/useIsMemberOnly';
import { usePaymentReminders } from '@/hooks/usePaymentReminders';
import { AddTransactionForm } from '@/components/forms/AddTransactionForm';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet';

const tabClass =
  'press flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[52px] px-1 text-muted-foreground';

const tabLabelClass = 'text-[10px] font-medium leading-none';

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
        <Icon className="h-5 w-5" />
        {dot && (
          <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-overdue" />
        )}
      </span>
      <span className={tabLabelClass}>{label}</span>
    </NavLink>
  );
}

/** A single destination row inside the "Más" sheet. */
interface SheetLink {
  to: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}

function MoreSheet() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { isAdmin } = useIsAdmin();
  const { isSuperAdmin } = useIsSuperAdmin();
  const { canManageUsers } = useCanManageUsers();
  const { canViewTreasury } = useCanViewTreasury();
  const { isMemberOnly } = useIsMemberOnly();

  // Off-bar treasury destinations, grouped exactly as the sidebar groups them.
  // Staff (not member-only) see the full set; member-only users get nothing
  // staff-scoped here (their on-bar tabs already cover their own pages).
  const overviewLinks: SheetLink[] = !isMemberOnly && canViewTreasury
    ? [
        { to: '/panel', icon: LayoutDashboard, label: t('nav.financialDetail') },
        { to: '/loans', icon: HandCoins, label: t('nav.loans') },
        { to: '/reports', icon: FileText, label: t('nav.reports') },
        { to: '/budget', icon: PieChart, label: t('nav.budget') },
      ]
    : [];

  const settingsLinks: SheetLink[] = !isMemberOnly && canViewTreasury
    ? [
        { to: '/monthly-fees', icon: Settings, label: t('nav.monthlyFees') },
        { to: '/expense-categories', icon: Wallet, label: t('nav.events') },
        { to: '/fee-calculator', icon: Calculator, label: t('nav.feeCalculator') },
        { to: '/recordatorios', icon: MessageSquare, label: t('nav.reminders') },
      ]
    : [];

  // Workspace switcher: same modules and role gates as the sidebar dropdown.
  const modules: { key: string; label: string; icon: ComponentType<{ className?: string }>; dest: string; show: boolean }[] = [
    { key: 'treasury', label: t('nav.treasury'), icon: Wallet, dest: '/', show: canViewTreasury },
    { key: 'library', label: t('nav.library'), icon: BookOpen, dest: '/library', show: true },
    { key: 'admin', label: t('nav.administration'), icon: UserCog, dest: '/user-management', show: canManageUsers },
  ];
  const visibleModules = modules.filter((m) => m.show);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  const Section = ({ title, links }: { title: string; links: SheetLink[] }) =>
    links.length > 0 ? (
      <div className="space-y-1">
        <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
        {links.map((l) => (
          <button
            key={l.to}
            type="button"
            onClick={() => go(l.to)}
            className="press flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted/60"
          >
            <l.icon className="h-5 w-5 text-muted-foreground" />
            <span>{l.label}</span>
          </button>
        ))}
      </div>
    ) : null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t('nav.more')}
          className={tabClass}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className={tabLabelClass}>{t('nav.more')}</span>
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto rounded-t-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <SheetHeader>
          <SheetTitle>{t('nav.more')}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          <Section title={t('nav.overview')} links={overviewLinks} />
          <Section title={t('nav.settings')} links={settingsLinks} />

          {visibleModules.length > 1 && (
            <div className="space-y-1 border-t border-border pt-4">
              <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('nav.switchModule')}
              </p>
              {visibleModules.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => go(m.dest)}
                  className="press flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-muted/60"
                >
                  <m.icon className="h-5 w-5 text-muted-foreground" />
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function BottomNav() {
  const { t } = useTranslation();
  const { isAdmin } = useIsAdmin();
  const { canViewTreasury } = useCanViewTreasury();
  const { isMemberOnly } = useIsMemberOnly();
  const { canManageUsers } = useCanManageUsers();

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
        // Distinct accessible name from the member-only "Mis pagos" tab below.
        { to: '/transactions', icon: Receipt, label: 'Movimientos' },
      ]
    : [
        { to: '/mis-pagos', icon: Receipt, label: 'Mis pagos' },
        { to: '/library', icon: BookOpen, label: t('nav.library') },
      ];

  // The "Más" sheet only carries treasury destinations or the module switcher,
  // so show it when the user can view treasury or has more than one workspace.
  const showMore = canViewTreasury || canManageUsers;

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

        {showMore && <MoreSheet />}
      </div>
    </nav>
  );
}
