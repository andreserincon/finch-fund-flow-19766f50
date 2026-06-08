/**
 * @file Home.tsx
 * @description Authenticated "Inicio" overview. For treasury users it answers
 *   the first questions of the day (caja, demorados, prestamos) and surfaces the
 *   month's recurring tasks (enviar recordatorios on the 5th business day, the
 *   Gran Logia transfer before day 5). Numbers are computed here from the
 *   authoritative backend balances; they do not touch the Panel's calculation.
 */

import { ReactNode } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { format, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { useCanViewTreasury } from '@/hooks/useCanViewTreasury';
import { useIsSuperAdmin } from '@/hooks/useIsSuperAdmin';
import { useIsMemberOnly } from '@/hooks/useIsMemberOnly';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useMembers } from '@/hooks/useMembers';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useLoans } from '@/hooks/useLoans';
import { useTransactions } from '@/hooks/useTransactions';
import { useAccountTransfers } from '@/hooks/useAccountTransfers';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { useHiddenMode } from '@/contexts/HiddenModeContext';
import { StatCard } from '@/components/dashboard/StatCard';
import { AddTransactionForm } from '@/components/forms/AddTransactionForm';
import { StatGridSkeleton } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';
import { cn, formatCurrencyCompact, getNthBusinessDayOfMonth } from '@/lib/utils';
import { getAttentionMembers, attentionTotalOwed, capitaOwed } from '@/lib/attention';
import { useMemberEventTotals } from '@/hooks/useMemberEventTotals';
import {
  Wallet, Landmark, AlertTriangle, HandCoins, MessageSquare, ArrowRight, Users,
  BookOpen, UserCog, FileText, Receipt, HandCoins as LoanIcon, LayoutDashboard,
} from 'lucide-react';
import type { AccountType, FeeType } from '@/lib/types';

export default function Home() {
  const navigate = useNavigate();
  const { canViewTreasury } = useCanViewTreasury();
  const { isSuperAdmin } = useIsSuperAdmin();
  const { isMemberOnly } = useIsMemberOnly();
  const { isAdmin } = useIsAdmin();
  const { displayName } = useHiddenMode();

  const { memberBalances, isLoading: membersLoading } = useMembers();
  const { currentMonthFees, monthlyFees, isLoading: feesLoading } = useMonthlyFees();
  const { loans, isLoading: loansLoading } = useLoans();
  const { transactions } = useTransactions();
  const { transfers } = useAccountTransfers();
  const { exchangeRate } = useExchangeRate();
  const { eventTotals, isLoading: eventTotalsLoading } = useMemberEventTotals();

  const now = new Date();

  const hour = now.getHours();
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
  const monthLabel = format(now, "MMMM yyyy", { locale: es });

  /* ---- KPIs (self-contained, current state) ---- */
  const balanceFor = (acc: AccountType) =>
    transactions
      .filter((t) => (acc === 'bank' ? t.account === 'bank' || !t.account : t.account === acc))
      .reduce((s, t) => s + (t.transaction_type === 'income' ? t.amount : -t.amount), 0)
    - transfers.filter((t) => t.from_account === acc).reduce((s, t) => s + t.amount, 0)
    + transfers.filter((t) => t.to_account === acc).reduce((s, t) => s + t.amount, 0);

  const bankBalance = balanceFor('bank');
  const greatLodgeBalance = balanceFor('great_lodge');
  const savingsBalance = balanceFor('savings'); // USD
  const totalARSBalance = bankBalance + greatLodgeBalance + savingsBalance * exchangeRate;

  const morosos = getAttentionMembers(memberBalances, currentMonthFees, eventTotals);
  const attentionTotal = attentionTotalOwed(morosos, eventTotals);
  const morosTop = morosos.slice(0, 5);

  const activeLoans = loans.filter((l) => l.status === 'active');
  const loansDueARS = activeLoans.filter((l) => l.account !== 'savings').reduce((s, l) => s + (l.amount - l.amount_paid), 0);
  const loansDueUSD = activeLoans.filter((l) => l.account === 'savings').reduce((s, l) => s + (l.amount - l.amount_paid), 0);

  /* ---- Month tasks / reminders (computed when the app is opened) ---- */
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12

  // Enviar recordatorios: the 5th business day of the month.
  const thisFifthBizDay = getNthBusinessDayOfMonth(y, m, 5);
  const reminderUrgent = isSameDay(now, thisFifthBizDay);
  const reminderPast = now > thisFifthBizDay && !reminderUrgent;
  const nextReminderDate = reminderPast
    ? getNthBusinessDayOfMonth(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1, 5)
    : thisFifthBizDay;

  // Gran Logia transfer: the great_lodge account must hold the last completed
  // month's capitas + 10% before day 5 (GL charges around day 10). Before day 5
  // the upcoming charge bills last month; from day 5 on, the next deadline bills
  // the current month. Fee type uses the member's current type as an estimate.
  const lastCalendarDay = new Date(y, m, 0).getDate();
  const isLastCalendarDay = now.getDate() === lastCalendarDay;
  const beforeDay5 = now.getDate() <= 4;
  const basisDate = new Date(y, now.getMonth() + (beforeDay5 ? -1 : 0), 1);
  const basisYM = format(basisDate, 'yyyy-MM-dd');
  const basisLabel = format(basisDate, 'MMMM', { locale: es });
  const feeFor = (ym: string, ft: FeeType) =>
    monthlyFees.find((f) => f.year_month === ym && f.fee_type === ft)?.amount ?? 0;
  const basisCapitas = memberBalances
    .filter((mm) => mm.is_active)
    .reduce((s, mm) => s + feeFor(basisYM, mm.fee_type), 0);
  const glRequired = basisCapitas * 1.1;
  const glCovered = greatLodgeBalance >= glRequired;
  const glShortfall = Math.max(0, glRequired - greatLodgeBalance);
  const glUrgent = isLastCalendarDay || (beforeDay5 && !glCovered);

  const isLoading = membersLoading || feesLoading || loansLoading || eventTotalsLoading;

  /* ---- quick links (role-gated) ---- */
  const quickLinks = [
    { label: 'Panel', to: '/panel', icon: LayoutDashboard, show: true },
    { label: 'Miembros', to: '/members', icon: Users, show: true },
    { label: 'Transacciones', to: '/transactions', icon: Receipt, show: !isMemberOnly },
    { label: 'Préstamos', to: '/loans', icon: LoanIcon, show: !isMemberOnly },
    { label: 'Reportes', to: '/reports', icon: FileText, show: !isMemberOnly },
    { label: 'Recordatorios', to: '/recordatorios', icon: MessageSquare, show: !isMemberOnly },
  ].filter((q) => q.show);

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      {/* Greeting + primary action */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">{greeting}</h1>
          <p className="text-sm text-muted-foreground">Logia Simón Bolívar Nº 646 · {monthLabel}</p>
        </div>
        {isAdmin && canViewTreasury && <AddTransactionForm triggerLabel="Registrar movimiento" />}
      </div>

      {canViewTreasury ? (
        <>
          {/* KPIs */}
          {isLoading ? (
            <StatGridSkeleton count={4} />
          ) : (
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <StatCard
                title="Banco (ARS)"
                value={formatCurrencyCompact(bankBalance)}
                subtitle="Cuenta bancaria principal"
                icon={<Landmark className="h-8 w-8 text-primary/30" />}
                variant={bankBalance >= 0 ? 'success' : 'danger'}
                to={!isMemberOnly ? '/transactions' : undefined}
              />
              {!isMemberOnly && (
                <StatCard
                  title="Miembros demorados"
                  value={morosos.length}
                  subtitle={`Deben ${formatCurrencyCompact(attentionTotal)}`}
                  icon={<AlertTriangle className="h-8 w-8 text-overdue/50" />}
                  variant={morosos.length > 0 ? 'danger' : 'success'}
                  to="/members?atencion=1"
                />
              )}
              <StatCard
                title="Caja total (ARS)"
                value={formatCurrencyCompact(totalARSBalance)}
                subtitle="Banco + Gran Logia + ahorro"
                icon={<Wallet className="h-8 w-8 text-primary/30" />}
                variant={totalARSBalance >= 0 ? 'success' : 'danger'}
              />
              <StatCard
                title="Préstamos por cobrar"
                value={formatCurrencyCompact(loansDueUSD, 'USD')}
                subtitle={`ARS ${formatCurrencyCompact(loansDueARS)}`}
                icon={<HandCoins className="h-8 w-8 text-warning/40" />}
                variant={loansDueUSD > 0 ? 'warning' : 'success'}
                to={!isMemberOnly ? '/loans' : undefined}
              />
            </div>
          )}

          {/* Recordatorios del mes (tareas recurrentes) */}
          {!isMemberOnly && !isLoading && (
            <div className="stat-card">
              <h2 className="section-header mb-4 font-display">Recordatorios del mes</h2>
              <div className="space-y-3">
                <Link
                  to="/recordatorios"
                  className="press flex items-center justify-between gap-3 rounded-lg border p-3 hover:border-primary/40"
                >
                  <div className="flex items-start gap-3">
                    <MessageSquare className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Enviar recordatorios por WhatsApp</p>
                      <p className="text-xs text-muted-foreground">
                        {morosos.length} pendientes por enviar · 5º día hábil ({format(nextReminderDate, "d 'de' MMM", { locale: es })})
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    'shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium',
                    reminderUrgent ? 'bg-overdue/15 text-overdue' : 'bg-muted text-muted-foreground',
                  )}>
                    {reminderUrgent ? 'Hoy' : 'Programado'}
                  </span>
                </Link>

                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="flex items-start gap-3">
                    <Landmark className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Transferencia a la Gran Logia</p>
                      <p className="text-xs text-muted-foreground">
                        Saldo necesario antes del día 5: {formatCurrencyCompact(glRequired)} (capitas de {basisLabel} + 10%). Disponible: {formatCurrencyCompact(greatLodgeBalance)}.
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    'shrink-0 text-[11px] px-2 py-0.5 rounded-full font-medium',
                    glCovered ? 'bg-success/15 text-success' : glUrgent ? 'bg-overdue/15 text-overdue' : 'bg-warning/15 text-warning',
                  )}>
                    {glCovered ? 'Cubierto' : `Faltan ${formatCurrencyCompact(glShortfall)}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Attention banner */}
          {!isMemberOnly && !isLoading && morosos.length > 0 && (
            <Link
              to="/members?atencion=1"
              className="press block rounded-xl border border-overdue/40 bg-overdue/10 p-4 md:p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-overdue shrink-0 mt-0.5" />
                  <div>
                    <p className="text-base md:text-lg font-semibold text-foreground">
                      {morosos.length} miembros requieren atención
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Deben en total {formatCurrencyCompact(attentionTotal)}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-overdue shrink-0" />
              </div>
            </Link>
          )}

          {/* Attention list */}
          {!isMemberOnly && (
            <div className="stat-card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="section-header mb-0 font-display">Requieren atención</h2>
                <Link to="/members?atencion=1">
                  <Button variant="ghost" size="sm">
                    Ver todos <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
              {morosTop.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-success/30 mx-auto mb-2" />
                  <p className="text-muted-foreground">¡Todos los miembros están al día!</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {morosTop.map((m) => (
                    <div key={m.member_id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <p className="font-medium text-sm">{displayName(m.full_name, m.phone_number)}</p>
                      <span className="font-mono text-sm font-semibold text-destructive">
                        {formatCurrencyCompact(Math.max(0, capitaOwed(m, eventTotals)))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick links */}
          <div className="flex flex-wrap gap-2">
            {quickLinks.map((q) => (
              <button
                key={q.to}
                onClick={() => navigate(q.to)}
                className="press flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                <q.icon className="h-4 w-4" />
                {q.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        /* Non-treasury users land here: lead with their module */
        <div className="grid gap-4 sm:grid-cols-2">
          <ModuleTile title="Biblioteca" subtitle="Catálogo de libros de la Logia" icon={<BookOpen className="h-6 w-6 text-primary-foreground" />} onClick={() => navigate('/library')} />
        </div>
      )}

      {/* Otros módulos (always available ones) */}
      {(canViewTreasury) && (
        <div>
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground/70 font-semibold mb-3">Otros módulos</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ModuleTile title="Biblioteca" subtitle="Catálogo de libros" icon={<BookOpen className="h-5 w-5 text-primary-foreground" />} onClick={() => navigate('/library')} />
            {isSuperAdmin && (
              <ModuleTile title="Administración" subtitle="Gestión de usuarios y miembros" icon={<UserCog className="h-5 w-5 text-primary-foreground" />} onClick={() => navigate('/user-management')} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact module entry tile. */
function ModuleTile({
  title, subtitle, icon, onClick,
}: { title: string; subtitle: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="press flex items-center gap-3 rounded-xl border bg-card p-4 text-left hover:shadow-md hover:border-primary/40 transition-all"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg gradient-primary">{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold text-foreground truncate">{title}</span>
        <span className="block text-xs text-muted-foreground truncate">{subtitle}</span>
      </span>
    </button>
  );
}
