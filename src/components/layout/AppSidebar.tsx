/**
 * @file AppSidebar.tsx
 * @description Main navigation sidebar. Renders different nav groups
 *   depending on the active module (Treasury / Library / Admin).
 *   The module switcher dropdown in the header lets users jump
 *   between modules. Visibility of modules and items is role-gated.
 */

import {
  LayoutDashboard,
  Users,
  Receipt,
  PlusCircle,
  LogOut,
  Wallet,
  Settings,
  Calculator,
  ArrowLeftRight,
  HandCoins,
  UserCog,
  FileText,
  BookOpen,
  ClipboardList,
  ChevronDown,
  Plus,
  Home,
  PieChart
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { NavLink } from '@/components/NavLink';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { useIsBibliotecario } from '@/hooks/useIsBibliotecario';
import { useCanViewTreasury } from '@/hooks/useCanViewTreasury';
import { useIsMemberOnly } from '@/hooks/useIsMemberOnly';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

/** The three top-level application modules */
type AppModule = 'treasury' | 'library' | 'admin';

export function AppSidebar() {
  const { signOut, user } = useAuth();
  const { t } = useTranslation();
  const { isAdmin } = useIsAdmin();
  const { isSuperAdmin } = useIsSuperAdmin();
  const { isBibliotecario } = useIsBibliotecario();
  const { canViewTreasury } = useCanViewTreasury();
  const { isMemberOnly } = useIsMemberOnly();
  const location = useLocation();

  /** Derive the active module from the current URL path */
  const deriveModule = (): AppModule => {
    if (location.pathname.startsWith('/library')) return 'library';
    if (location.pathname.startsWith('/user-management') || location.pathname.startsWith('/admin/members')) return 'admin';
    if (canViewTreasury) return 'treasury';
    return 'library';
  };

  const [activeModule, setActiveModule] = useState<AppModule>(deriveModule);

  // Re-derive on route or permission changes
  useEffect(() => {
    setActiveModule(deriveModule());
  }, [location.pathname, canViewTreasury]);

  /* ── Module definitions for the switcher dropdown ── */
  const modules: { key: AppModule; label: string; sublabel: string; icon: any; show: boolean }[] = [
    { key: 'treasury', label: t('nav.treasury'), sublabel: t('nav.managementSystem'), icon: Wallet, show: canViewTreasury },
    { key: 'library', label: t('nav.library'), sublabel: t('library.subtitle'), icon: BookOpen, show: true },
    { key: 'admin', label: t('nav.administration'), sublabel: t('nav.adminSubtitle'), icon: UserCog, show: isSuperAdmin },
  ];

  const visibleModules = modules.filter(m => m.show);
  const currentModule = visibleModules.find(m => m.key === activeModule) || visibleModules[0];

  /* ── Treasury nav items ── */
  const mainNavItems = [
    { title: t('nav.dashboard'), url: '/', icon: LayoutDashboard },
    { title: t('nav.members'), url: '/members', icon: Users },
    // Staff-only items (hidden from member-only users)
    ...(!isMemberOnly ? [
      { title: t('nav.transactions'), url: '/transactions', icon: Receipt },
      { title: t('nav.loans'), url: '/loans', icon: HandCoins },
      { title: t('nav.reports'), url: '/reports', icon: FileText },
      { title: t('nav.budget'), url: '/budget', icon: PieChart },
    ] : []),
  ];

  /** Admin-only quick actions (log payment, expense, transfer) */
  const actionItems = [
    { title: t('nav.logPayment'), url: '/log-payment', icon: PlusCircle },
    { title: t('nav.logExpense'), url: '/log-expense', icon: Wallet },
    { title: t('nav.transferFunds'), url: '/account-transfer', icon: ArrowLeftRight },
  ];

  /** Treasury settings pages (fees, events, calculator) */
  const settingsItems = [
    { title: t('nav.monthlyFees'), url: '/monthly-fees', icon: Settings },
    { title: t('nav.events'), url: '/expense-categories', icon: Wallet },
    { title: t('nav.feeCalculator'), url: '/fee-calculator', icon: Calculator },
  ];

  /* ── Admin module nav items ── */
  const adminNavItems = [
    { title: t('nav.userManagement'), url: '/user-management', icon: UserCog },
    { title: t('nav.members'), url: '/admin/members', icon: Users },
  ];

  /* ── Library module nav items ── */
  const libraryNavItems = [
    { title: t('library.browse'), url: '/library', icon: BookOpen },
    { title: t('digitalLibrary.title'), url: '/library?tab=digital', icon: FileText },
    { title: t('library.addBook'), url: '/library?tab=add', icon: Plus },
  ];

  /** Librarian-only management items */
  const libraryAdminItems = [
    { title: t('library.manage'), tab: 'manage', icon: Settings },
    { title: t('library.requests'), tab: 'requests', icon: ClipboardList },
  ];

  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* ── Header: module switcher dropdown ── */}
      <SidebarHeader className="p-2 group-data-[state=collapsed]:p-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 w-full rounded-lg p-2 hover:bg-sidebar-accent transition-colors text-left group-data-[state=collapsed]:justify-center group-data-[state=collapsed]:p-1 group-data-[state=collapsed]:gap-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary shrink-0 group-data-[state=collapsed]:h-8 group-data-[state=collapsed]:w-8">
                <currentModule.icon className="h-5 w-5 text-primary-foreground group-data-[state=collapsed]:h-4 group-data-[state=collapsed]:w-4" />
              </div>
              <div className="flex-1 min-w-0 group-data-[state=collapsed]:hidden">
                <h1 className="text-sm font-semibold text-sidebar-foreground truncate">{currentModule.label}</h1>
                <p className="text-xs text-sidebar-foreground/60 truncate">{currentModule.sublabel}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-sidebar-foreground/40 shrink-0 group-data-[state=collapsed]:hidden" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[220px]">
            {visibleModules.map((mod) => (
              <DropdownMenuItem
                key={mod.key}
                onClick={() => {
                  setActiveModule(mod.key);
                  const dest = mod.key === 'library' ? '/library' : mod.key === 'admin' ? '/user-management' : '/';
                  navigate(dest);
                }}
                className="flex items-center gap-3 p-2"
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-md ${mod.key === activeModule ? 'gradient-primary' : 'bg-muted'}`}>
                  <mod.icon className={`h-4 w-4 ${mod.key === activeModule ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <p className="text-sm font-medium">{mod.label}</p>
                  <p className="text-xs text-muted-foreground">{mod.sublabel}</p>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      {/* ── Content: module-specific navigation ── */}
      <SidebarContent>
        {/* Treasury module */}
        {activeModule === 'treasury' && (
          <>
            {/* Overview section */}
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider px-3">
                {t('nav.overview')}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {mainNavItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end={item.url === '/'}
                          className="sidebar-nav-item"
                          activeClassName="active"
                        >
                          <item.icon className="h-5 w-5" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Quick actions (admin only) */}
            {isAdmin && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider px-3">
                  {t('nav.quickActions')}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {actionItems.map((item) => (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            className="sidebar-nav-item"
                            activeClassName="active"
                          >
                            <item.icon className="h-5 w-5" />
                            <span>{item.title}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* Settings (staff, not member-only) */}
            {!isMemberOnly && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider px-3">
                  {t('nav.settings')}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {settingsItems.map((item) => (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to={item.url}
                            className="sidebar-nav-item"
                            activeClassName="active"
                          >
                            <item.icon className="h-5 w-5" />
                            <span>{item.title}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        )}

        {/* Admin module */}
        {activeModule === 'admin' && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider px-3">
              {t('nav.administration')}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavItems.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className="sidebar-nav-item"
                        activeClassName="active"
                      >
                        <item.icon className="h-5 w-5" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Library module */}
        {activeModule === 'library' && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider px-3">
                {t('library.title')}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {libraryNavItems.map((item) => {
                    const isActive = item.url === '/library'
                      ? location.pathname === '/library' && !location.search
                      : location.pathname + location.search === item.url;
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton asChild>
                          <button
                            onClick={() => navigate(item.url)}
                            className={`sidebar-nav-item w-full flex items-center gap-2 ${isActive ? 'active' : ''}`}
                          >
                            <item.icon className="h-5 w-5" />
                            <span>{item.title}</span>
                          </button>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {/* Librarian admin items */}
            {isBibliotecario && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider px-3">
                  {t('nav.settings')}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {libraryAdminItems.map((item) => {
                      const isActive = location.pathname === '/library' &&
                        new URLSearchParams(location.search).get('tab') === item.tab;
                      return (
                        <SidebarMenuItem key={item.tab}>
                          <SidebarMenuButton asChild>
                            <button
                              onClick={() => navigate(`/library?tab=${item.tab}`)}
                              className={`sidebar-nav-item w-full flex items-center gap-2 ${isActive ? 'active' : ''}`}
                            >
                              <item.icon className="h-5 w-5" />
                              <span>{item.title}</span>
                            </button>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        )}
      </SidebarContent>

      {/* ── Footer: home link, user info, sign-out ── */}
      <SidebarFooter className="p-4 border-t border-sidebar-border space-y-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/home')}
          className="w-full justify-start text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Home className="mr-2 h-4 w-4" />
          {t('home.title', 'Inicio')}
        </Button>
        <div className="flex items-center justify-between">
          <div className="flex-1 truncate">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.email}
            </p>
            <p className="text-xs text-sidebar-foreground/60">
              {isAdmin ? t('nav.treasurer') : t('nav.viewer')}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
