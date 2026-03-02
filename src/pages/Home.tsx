/**
 * @file Home.tsx
 * @description Authenticated landing page. Displays module cards
 *   (Treasury, Library, Administration) with role-based visibility
 *   and quick-access shortcut buttons for each module.
 */

import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCanViewTreasury } from '@/hooks/useCanViewTreasury';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { useIsMemberOnly } from '@/hooks/useIsMemberOnly';
import { useAuth } from '@/hooks/useAuth';
import {
  Wallet,
  BookOpen,
  UserCog,
  LayoutDashboard,
  Users,
  Receipt,
  HandCoins,
  FileText,
  Plus,
  ClipboardList,
  Settings,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  ModuleCard – reusable card component for each module              */
/* ------------------------------------------------------------------ */

/** Props for the ModuleCard component */
interface ModuleCardProps {
  /** Card title displayed next to the icon */
  title: string;
  /** Short description below the title */
  subtitle: string;
  /** Icon rendered inside the coloured badge */
  icon: React.ReactNode;
  /** Tailwind gradient class for the icon badge */
  gradient: string;
  /** Quick-access links rendered at the bottom of the card */
  shortcuts: { label: string; icon: React.ReactNode; onClick: () => void }[];
  /** Callback when the card header area is clicked */
  onClick: () => void;
}

/**
 * ModuleCard – renders a single module entry with icon, title,
 * description, and an optional grid of shortcut buttons.
 */
function ModuleCard({ title, subtitle, icon, gradient, shortcuts, onClick }: ModuleCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border bg-card shadow-sm hover:shadow-lg transition-all duration-300">
      {/* ── Card header (clickable) ── */}
      <button
        onClick={onClick}
        className="w-full text-left p-6 pb-4 focus:outline-none"
      >
        <div className="flex items-start gap-4">
          {/* Icon badge with gradient background */}
          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${gradient} shadow-md group-hover:scale-105 transition-transform duration-300`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
              {title}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
              {subtitle}
            </p>
          </div>
        </div>
      </button>

      {/* ── Shortcut buttons ── */}
      {shortcuts.length > 0 && (
        <div className="px-6 pb-5 pt-1">
          <div className="border-t border-border/60 pt-4">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold mb-3">
              Acceso rápido
            </p>
            <div className="grid grid-cols-2 gap-2">
              {shortcuts.map((shortcut, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent card-level click
                    shortcut.onClick();
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs font-medium text-muted-foreground bg-muted/50 hover:bg-primary/10 hover:text-primary transition-all duration-200 text-left"
                >
                  {shortcut.icon}
                  <span className="truncate">{shortcut.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Home page component                                               */
/* ================================================================== */

export default function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Role-based flags to conditionally render modules
  const { canViewTreasury } = useCanViewTreasury();
  const { isSuperAdmin } = useIsSuperAdmin();
  const { isMemberOnly } = useIsMemberOnly();
  const { user } = useAuth();

  /* ── Treasury shortcuts (differ for member-only vs staff) ── */
  const treasuryShortcuts = isMemberOnly
    ? [
        { label: t('nav.dashboard'), icon: <LayoutDashboard className="h-4 w-4" />, onClick: () => navigate('/') },
        { label: t('nav.members'), icon: <Users className="h-4 w-4" />, onClick: () => navigate('/members') },
      ]
    : [
        { label: t('nav.dashboard'), icon: <LayoutDashboard className="h-4 w-4" />, onClick: () => navigate('/') },
        { label: t('nav.members'), icon: <Users className="h-4 w-4" />, onClick: () => navigate('/members') },
        { label: t('nav.transactions'), icon: <Receipt className="h-4 w-4" />, onClick: () => navigate('/transactions') },
        { label: t('nav.loans'), icon: <HandCoins className="h-4 w-4" />, onClick: () => navigate('/loans') },
        { label: t('nav.reports'), icon: <FileText className="h-4 w-4" />, onClick: () => navigate('/reports') },
        { label: t('nav.monthlyFees'), icon: <Settings className="h-4 w-4" />, onClick: () => navigate('/monthly-fees') },
      ];

  /* ── Library shortcuts ── */
  const libraryShortcuts = [
    { label: t('library.browse'), icon: <BookOpen className="h-4 w-4" />, onClick: () => navigate('/library') },
    { label: t('digitalLibrary.title'), icon: <FileText className="h-4 w-4" />, onClick: () => navigate('/library?tab=digital') },
    { label: t('library.addBook'), icon: <Plus className="h-4 w-4" />, onClick: () => navigate('/library?tab=add') },
    { label: t('library.requests'), icon: <ClipboardList className="h-4 w-4" />, onClick: () => navigate('/library?tab=requests') },
  ];

  /* ── Admin shortcuts ── */
  const adminShortcuts = [
    { label: t('nav.userManagement'), icon: <UserCog className="h-4 w-4" />, onClick: () => navigate('/user-management') },
    { label: t('nav.members'), icon: <Users className="h-4 w-4" />, onClick: () => navigate('/admin/members') },
  ];

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 py-8 animate-fade-in">
      {/* ── Welcome header ── */}
      <div className="text-center mb-10 max-w-lg">
        <div className="flex justify-center mb-4">
          <img
            src="/images/lodge-logo.png"
            alt="Logo"
            className="h-16 w-16 rounded-xl shadow-md"
          />
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">
          {t('home.welcome', 'Bienvenido')}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm md:text-base">
          {t('home.selectModule', 'Seleccioná un módulo para comenzar')}
        </p>
      </div>

      {/* ── Module cards grid ── */}
      <div className="w-full max-w-3xl grid gap-5 md:grid-cols-2 lg:grid-cols-2">
        {/* Treasury module – visible only to users with treasury access */}
        {canViewTreasury && (
          <ModuleCard
            title={t('nav.treasury')}
            subtitle={t('nav.managementSystem')}
            icon={<Wallet className="h-7 w-7 text-primary-foreground" />}
            gradient="gradient-primary"
            shortcuts={treasuryShortcuts}
            onClick={() => navigate('/')}
          />
        )}

        {/* Library module – visible to all authenticated users */}
        <ModuleCard
          title={t('nav.library')}
          subtitle={t('library.subtitle')}
          icon={<BookOpen className="h-7 w-7 text-primary-foreground" />}
          gradient="bg-gradient-to-br from-amber-600 to-amber-800"
          shortcuts={libraryShortcuts}
          onClick={() => navigate('/library')}
        />

        {/* Administration module – super-admin only */}
        {isSuperAdmin && (
          <ModuleCard
            title={t('nav.administration')}
            subtitle={t('nav.adminSubtitle')}
            icon={<UserCog className="h-7 w-7 text-primary-foreground" />}
            gradient="bg-gradient-to-br from-slate-600 to-slate-800"
            shortcuts={adminShortcuts}
            onClick={() => navigate('/user-management')}
          />
        )}
      </div>

      {/* ── Footer with logged-in user email ── */}
      <p className="text-xs text-muted-foreground/50 mt-10">
        {user?.email}
      </p>
    </div>
  );
}
