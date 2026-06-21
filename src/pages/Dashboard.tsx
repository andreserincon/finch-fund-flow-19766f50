import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useHiddenMode } from '@/contexts/HiddenModeContext';
import { useMembers } from '@/hooks/useMembers';
import { useTransactions } from '@/hooks/useTransactions';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useMemberFeeTypeHistory } from '@/hooks/useMemberFeeTypeHistory';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { StatCard } from '@/components/dashboard/StatCard';
import { MemberFeeMatrix } from '@/components/dashboard/MemberFeeMatrix';
import { DashboardSkeleton } from '@/components/ui/loading';
import { LodgeLoader } from '@/components/lodge/LodgeLoader';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { usePaymentReminders } from '@/hooks/usePaymentReminders';

import { useAccountTransfers } from '@/hooks/useAccountTransfers';
import { useLoans } from '@/hooks/useLoans';
import { AddTransactionForm } from '@/components/forms/AddTransactionForm';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { useIsMemberOnly } from '@/hooks/useIsMemberOnly';
import { useLodgeFinancials } from '@/hooks/useLodgeFinancials';
import { useMyEventDebt } from '@/hooks/useMyEventDebt';
import { useAuth } from '@/hooks/useAuth';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Wallet,
  Users,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Landmark,
  HandCoins,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  MessageSquare
} from 'lucide-react';
import { format, lastDayOfMonth, startOfMonth, startOfYear, addMonths, isAfter } from 'date-fns';
import { parseLocalDate } from '@/lib/utils';
import { getAttentionMembers, attentionTotalOwed, capitaOwed } from '@/lib/attention';
import { useMemberEventTotals } from '@/hooks/useMemberEventTotals';
import { es } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FeeType } from '@/lib/types';


export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { displayName } = useHiddenMode();
  const { members, memberBalances, isLoading: membersLoading } = useMembers();
  const { transactions, isLoading: transactionsLoading } = useTransactions();
  const { monthlyFees, currentMonthFees, isLoading: feesLoading } = useMonthlyFees();
  const { transfers, isLoading: transfersLoading } = useAccountTransfers();
  const { loans, isLoading: loansLoading } = useLoans();
  const { getFeeTypeForMonth: getHistoricalFeeType, history, isLoading: historyLoading } = useMemberFeeTypeHistory();
  const { isAdmin } = useIsAdmin();
  const { isMemberOnly } = useIsMemberOnly();
  const { data: lodgeFin } = useLodgeFinancials(isMemberOnly);
  const { data: myEventDebt = 0 } = useMyEventDebt(isMemberOnly);
  const { profile, loading: authLoading } = useAuth();
  const userMemberId = profile?.member_id;
  const { exchangeRate } = useExchangeRate();
  const { eventTotals, isLoading: eventTotalsLoading } = useMemberEventTotals();

  const dateLocale = es;

  // Month/Year filter state - default to current month
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedYM, setSelectedYM] = useState<string>(currentYM);

  // Pending WhatsApp reminders for the current period (surfaced on the dashboard)
  const { reminders: currentPeriodReminders } = usePaymentReminders({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const pendingRemindersCount = currentPeriodReminders.filter(
    (r) => r.status === 'pending_review',
  ).length;

  // Build available month options from transactions
  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    transactions.forEach((t) => {
      months.add(t.transaction_date.substring(0, 7));
    });
    months.add(currentYM);
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [transactions, currentYM]);

  // Compute the cutoff date: last day of selected month
  const selectedDate = parseLocalDate(`${selectedYM}-01`);
  const cutoffDate = lastDayOfMonth(selectedDate);
  const selectedMonthStart = startOfMonth(selectedDate);
  const selectedYearStart = startOfYear(selectedDate);
  const isCurrentMonth = selectedYM === currentYM;
  const selectedMonthKey = `${selectedYM}-01`; // "YYYY-MM-01"

  // Filter transactions and transfers up to the cutoff date
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => parseLocalDate(t.transaction_date) <= cutoffDate);
  }, [transactions, cutoffDate]);

  const filteredTransfers = useMemo(() => {
    return transfers.filter(t => parseLocalDate(t.transfer_date) <= cutoffDate);
  }, [transfers, cutoffDate]);

  // Filter loans: those active as of the cutoff
  const filteredLoans = useMemo(() => {
    return loans.filter(l => {
      const loanDate = parseLocalDate(l.loan_date);
      if (loanDate > cutoffDate) return false;
      if (l.status === 'paid' && l.paid_date && parseLocalDate(l.paid_date) <= cutoffDate) return false;
      if (l.status === 'cancelled') return false;
      return true;
    });
  }, [loans, cutoffDate]);

  // Helper: get fee type for a member at a given month
  const getMemberFeeType = (memberId: string, monthKey: string, fallbackFeeType: FeeType): FeeType => {
    return getHistoricalFeeType(memberId, monthKey) ?? fallbackFeeType;
  };

  // Helper: get fee amount for a month+type
  const getFeeForMonth = (monthKey: string, feeType: FeeType): number => {
    const fee = monthlyFees.find(f => f.year_month === monthKey && f.fee_type === feeType);
    return fee?.amount ?? 0;
  };

  // Helper: generate month range as "YYYY-MM-01" strings
  const generateMonthRange = (startDate: Date, endDate: Date): string[] => {
    const result: string[] = [];
    let current = startOfMonth(startDate);
    const end = startOfMonth(endDate);
    while (!isAfter(current, end)) {
      result.push(format(current, 'yyyy-MM-dd'));
      current = addMonths(current, 1);
    }
    return result;
  };

  // Compute adjusted member balances as of the selected month
  const adjustedMemberBalances = useMemo(() => {
    // One pass over the filtered transactions to sum each member's capita
    // (monthly_fee income) paid, instead of re-filtering the whole transaction
    // list once per member. Event payments are intentionally EXCLUDED so this
    // stays consistent with the capita-only total_fees_owed below; events are
    // tracked separately via memberEventDebts / memberEventInfo. (Mixing event
    // payments in here made the "Estado de Capitas Mensuales" matrix and the
    // capita-only metrics credit event money against monthly-dues debt.)
    const paidByMember = new Map<string, number>();
    for (const tx of filteredTransactions) {
      if (
        tx.member_id &&
        tx.transaction_type === 'income' &&
        tx.category === 'monthly_fee'
      ) {
        paidByMember.set(tx.member_id, (paidByMember.get(tx.member_id) ?? 0) + tx.amount);
      }
    }

    return memberBalances.map(m => {
      const adjustedTotalPaid = paidByMember.get(m.member_id) ?? 0;

      // total_fees_owed: sum monthly fees from join date to selected month
      const joinDate = parseLocalDate(m.join_date);
      const monthsRange = generateMonthRange(joinDate, selectedDate);
      let monthlyFeesOwed = 0;
      for (const mKey of monthsRange) {
        const feeType = getMemberFeeType(m.member_id, mKey, m.fee_type);
        monthlyFeesOwed += getFeeForMonth(mKey, feeType);
      }

      const adjustedTotalFeesOwed = monthlyFeesOwed; // capita-only; event fees tracked separately via memberEventDebts

      return {
        ...m,
        total_paid: adjustedTotalPaid,
        total_fees_owed: adjustedTotalFeesOwed,
        current_balance: adjustedTotalPaid - adjustedTotalFeesOwed,
      };
    });
    // getMemberFeeType/getFeeForMonth read history + monthlyFees, both in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberBalances, filteredTransactions, selectedDate, monthlyFees, history]);

  // Query unpaid event amounts per member, classified by deadline status.
  // - 'moroso': today > deadline
  // - 'demorado': within 15 days of deadline (today >= deadline - 15)
  // - 'pending': has debt but not yet within demorado window (or no deadline set)
  // Only ACTIVE events are considered for status flags.
  const { data: memberEventInfo = { totals: {}, statuses: {} } } = useQuery<{
    totals: Record<string, number>;
    statuses: Record<string, { demorado: boolean; moroso: boolean }>;
  }>({
    queryKey: ['member-event-debts-classified'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_member_payments')
        .select('member_id, amount_owed, amount_paid, extraordinary_expenses!inner(is_active, payment_deadline)');

      if (error) throw error;

      const totals: Record<string, number> = {};
      const statuses: Record<string, { demorado: boolean; moroso: boolean }> = {};
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      data?.forEach((row: any) => {
        const unpaid = Number(row.amount_owed) - Number(row.amount_paid);
        if (unpaid <= 0 || !row.member_id) return;
        const event = row.extraordinary_expenses;
        if (!event?.is_active) return;

        totals[row.member_id] = (totals[row.member_id] || 0) + unpaid;

        if (event.payment_deadline) {
          const deadline = parseLocalDate(event.payment_deadline);
          const warningStart = new Date(deadline);
          warningStart.setDate(warningStart.getDate() - 15);

          if (!statuses[row.member_id]) statuses[row.member_id] = { demorado: false, moroso: false };
          if (today > deadline) {
            statuses[row.member_id].moroso = true;
          } else if (today >= warningStart) {
            statuses[row.member_id].demorado = true;
          }
        }
      });
      return { totals, statuses };
    },
  });

  const memberEventDebts = memberEventInfo.totals;
  const memberEventStatuses = memberEventInfo.statuses;

  const isLoading = membersLoading || transactionsLoading || feesLoading || transfersLoading || loansLoading || historyLoading || eventTotalsLoading;

  // Calculate total loans due (ARS and USD separately)
  const activeLoans = filteredLoans;
  const loansARS = activeLoans.filter(l => l.account === 'bank');
  const loansUSD = activeLoans.filter(l => l.account === 'savings');
  const totalLoansDueARS = loansARS.reduce((sum, l) => sum + (l.amount - l.amount_paid), 0);
  const totalLoansDueUSD = loansUSD.reduce((sum, l) => sum + (l.amount - l.amount_paid), 0);

  // One pass over the filtered transactions (and transfers) for every money
  // total on the Panel: the three account balances, the monthly/annual yields,
  // and the monthly income/expense. Memoized so they are not each re-filtered
  // and re-reduced on every render. Same formulas, same sign rules as before.
  const accountTotals = useMemo(() => {
    let bankTx = 0, glTx = 0, savTx = 0;
    let monthlyYieldARS = 0, monthlyYieldUSD = 0, annualYieldARS = 0, annualYieldUSD = 0;
    let monthlyIncomeARS = 0, monthlyIncomeUSD = 0, monthlyExpensesARS = 0, monthlyExpensesUSD = 0;

    for (const t of filteredTransactions) {
      const signed = t.transaction_type === 'income' ? t.amount : -t.amount;
      const isSavings = t.account === 'savings';

      if (t.account === 'bank' || !t.account) bankTx += signed;
      else if (t.account === 'great_lodge') glTx += signed;
      else if (isSavings) savTx += signed;

      const d = parseLocalDate(t.transaction_date);
      const inMonth = d >= selectedMonthStart;
      const inYear = d >= selectedYearStart;

      if (t.category === 'account_yield') {
        if (inMonth) { if (isSavings) monthlyYieldUSD += signed; else monthlyYieldARS += signed; }
        if (inYear) { if (isSavings) annualYieldUSD += signed; else annualYieldARS += signed; }
      }

      if (inMonth) {
        if (t.transaction_type === 'income') {
          if (isSavings) monthlyIncomeUSD += t.amount; else monthlyIncomeARS += t.amount;
        } else if (t.transaction_type === 'expense') {
          if (isSavings) monthlyExpensesUSD += t.amount; else monthlyExpensesARS += t.amount;
        }
      }
    }

    let bankTr = 0, glTr = 0, savTr = 0;
    for (const tr of filteredTransfers) {
      if (tr.from_account === 'bank') bankTr -= tr.amount;
      if (tr.to_account === 'bank') bankTr += tr.amount;
      if (tr.from_account === 'great_lodge') glTr -= tr.amount;
      if (tr.to_account === 'great_lodge') glTr += tr.amount;
      if (tr.from_account === 'savings') savTr -= tr.amount;
      if (tr.to_account === 'savings') savTr += tr.amount;
    }

    return {
      bankBalance: bankTx + bankTr,
      greatLodgeBalance: glTx + glTr,
      savingsBalance: savTx + savTr,
      monthlyYieldARS, monthlyYieldUSD, annualYieldARS, annualYieldUSD,
      monthlyIncomeARS, monthlyIncomeUSD, monthlyExpensesARS, monthlyExpensesUSD,
    };
  }, [filteredTransactions, filteredTransfers, selectedMonthStart, selectedYearStart]);

  const { bankBalance, greatLodgeBalance, savingsBalance } = accountTotals;

  const savingsInARS = savingsBalance * exchangeRate;
  const totalARSBalance = bankBalance + greatLodgeBalance + savingsInARS;

  // Member-only users have RLS scoped to their own transaction rows, so the
  // client-side sums above only cover their own payments, not the lodge. For
  // them we display the aggregate balances from get_lodge_financials() instead.
  // Everyone else keeps the live, month-filtered client computation.
  const showBank = isMemberOnly ? Number(lodgeFin?.bank_balance ?? 0) : bankBalance;
  const showGreatLodge = isMemberOnly ? Number(lodgeFin?.great_lodge_balance ?? 0) : greatLodgeBalance;
  const showSavings = isMemberOnly ? Number(lodgeFin?.savings_balance ?? 0) : savingsBalance;
  const showTotalARS = isMemberOnly
    ? showBank + showGreatLodge + showSavings * exchangeRate
    : totalARSBalance;

  // Account yield (monthly and annual) for the selected month/year
  const { monthlyYieldARS, monthlyYieldUSD, annualYieldARS, annualYieldUSD } = accountTotals;
  const totalMonthlyYield = monthlyYieldARS + (monthlyYieldUSD * exchangeRate);
  const totalAnnualYield = annualYieldARS + (annualYieldUSD * exchangeRate);

  const activeMembersCount = adjustedMemberBalances.filter(m => m.is_active).length;

  // Get fee rates for the selected month
  const selectedMonthFees: Record<FeeType, number> = {
    standard: getFeeForMonth(selectedMonthKey, 'standard'),
    solidarity: getFeeForMonth(selectedMonthKey, 'solidarity'),
  };
  // Fallback to current month fees if selected month has no fee config
  const effectiveFees = (selectedMonthFees.standard > 0 || selectedMonthFees.solidarity > 0)
    ? selectedMonthFees
    : currentMonthFees;

  // Capita-only metrics (events excluded)
  const membersUnpaid = adjustedMemberBalances.filter(m => {
    if (!m.is_active) return false;
    return m.total_paid < m.total_fees_owed;
  }).length;

  // Event-only metrics
  const activeMemberIds = new Set(adjustedMemberBalances.filter(m => m.is_active).map(m => m.member_id));
  const eventDemoradoCount = Object.entries(memberEventStatuses)
    .filter(([id, s]) => activeMemberIds.has(id) && s.demorado && !s.moroso).length;
  const eventMorosoCount = Object.entries(memberEventStatuses)
    .filter(([id, s]) => activeMemberIds.has(id) && s.moroso).length;
  
  // Monthly income/expenses for the selected month
  const { monthlyIncomeARS, monthlyIncomeUSD, monthlyExpensesARS, monthlyExpensesUSD } = accountTotals;
  const monthlyIncome = monthlyIncomeARS + (monthlyIncomeUSD * exchangeRate);
  const monthlyExpenses = monthlyExpensesARS + (monthlyExpensesUSD * exchangeRate);

  // Compute adjusted total_paid map for MemberFeeMatrix
  const adjustedTotalPaidMap = useMemo(() => {
    const map: Record<string, number> = {};
    adjustedMemberBalances.forEach(m => {
      map[m.member_id] = m.total_paid;
    });
    return map;
  }, [adjustedMemberBalances]);

  // Members requiring attention (capita-only "pago demorado"). Shared
  // definition (src/lib/attention) so the Panel banner, the "Pago Demorado"
  // card, the Inicio overview, and the Members filter always agree.
  const overdueMembers = getAttentionMembers(memberBalances, currentMonthFees, eventTotals);
  const attentionTotal = attentionTotalOwed(overdueMembers, eventTotals);
  const membersOverdue = overdueMembers.length;

  const formatCurrency = (amount: number, currency: 'ARS' | 'USD' = 'ARS') => {
    return new Intl.NumberFormat(currency === 'ARS' ? 'es-AR' : 'en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground font-display">{t('dashboard.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {isCurrentMonth
                ? t('dashboard.financialOverview', { month: format(selectedDate, 'MMMM yyyy', { locale: dateLocale }) })
                : `Al ${format(cutoffDate, "d 'de' MMMM yyyy", { locale: dateLocale })}`
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedYM} onValueChange={setSelectedYM}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Seleccionar mes" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((ym) => {
                const d = parseLocalDate(`${ym}-01`);
                return (
                  <SelectItem key={ym} value={ym}>
                    {format(d, 'MMMM yyyy', { locale: dateLocale })}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {isAdmin && <AddTransactionForm triggerLabel={t('dashboard.logTransaction')} />}
        </div>
      </div>

      {/* Member personal hero: own standing first (view-only member) */}
      {isMemberOnly && (() => {
        // The profile loads on its own track, after the cached data queries.
        // Show a brief loader in just this card until it arrives, so we never
        // flash "no vinculado" and never block the rest of the dashboard on it.
        if (authLoading || !profile) {
          return (
            <div className="stat-card animate-fade-in">
              <LodgeLoader size={28} className="py-6" />
            </div>
          );
        }
        // Profile is resolved now, so a missing member_id means the account is
        // genuinely not linked, not still loading.
        if (!userMemberId) {
          return (
            <div className="stat-card animate-fade-in">
              <p className="text-sm text-muted-foreground">
                Tu usuario aún no está vinculado a una ficha de miembro. Escribile al Tesorero para vincularlo.
              </p>
            </div>
          );
        }
        const ownBalance = memberBalances.find((m) => m.member_id === userMemberId);
        // Three obligations a member can carry: monthly capitas, event shares,
        // and outstanding loans. Each is shown only when it owes something.
        const ownCapita = ownBalance ? Math.max(0, capitaOwed(ownBalance, eventTotals)) : 0;
        const ownEvents = Math.max(0, myEventDebt);
        const ownLoansARS = userMemberId
          ? filteredLoans
              .filter((l) => l.member_id === userMemberId && (l.account === 'bank' || !l.account))
              .reduce((s, l) => s + Math.max(0, l.amount - l.amount_paid), 0)
          : 0;
        const ownLoansUSD = userMemberId
          ? filteredLoans
              .filter((l) => l.member_id === userMemberId && l.account === 'savings')
              .reduce((s, l) => s + Math.max(0, l.amount - l.amount_paid), 0)
          : 0;
        const monthlyRate = ownBalance ? (effectiveFees[ownBalance.fee_type] || 0) : 0;

        const totalARSDue = ownCapita + ownEvents + ownLoansARS;
        const hasAnyDue = totalARSDue > 0 || ownLoansUSD > 0;
        // "Demorado" reserves the red badge for being more than a month behind
        // on capitas; anything else outstanding is the calmer "Pendiente".
        const ownStatus = !hasAnyDue
          ? { label: 'Al día', cls: 'status-up-to-date' }
          : ownCapita > monthlyRate
            ? { label: 'Demorado', cls: 'status-overdue' }
            : { label: 'Pendiente', cls: 'status-unpaid' };

        const breakdown: { label: string; amount: number; currency: 'ARS' | 'USD'; to?: string }[] = [
          { label: 'Capitas', amount: ownCapita, currency: 'ARS' },
          { label: 'Eventos', amount: ownEvents, currency: 'ARS' },
          { label: 'Préstamos', amount: ownLoansARS, currency: 'ARS', to: '/loans' },
          { label: 'Préstamos (USD)', amount: ownLoansUSD, currency: 'USD', to: '/loans' },
        ].filter((r) => r.amount > 0);

        // Headline: the ARS total normally; if the only debt is a USD loan,
        // show that figure instead of a misleading $0.
        const headline = !hasAnyDue
          ? 'Al día'
          : totalARSDue > 0
            ? formatCurrency(totalARSDue)
            : formatCurrency(ownLoansUSD, 'USD');

        return (
          <div className="stat-card animate-fade-in">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground font-medium">Tu estado de cuenta</p>
                <p className={`mt-1 text-2xl font-mono tabular-nums font-semibold ${hasAnyDue ? 'text-destructive' : 'text-success'}`}>
                  {headline}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {hasAnyDue ? 'total adeudado' : 'Sin saldos pendientes'}
                </p>
              </div>
              <span className={`status-badge ${ownStatus.cls}`}>{ownStatus.label}</span>
            </div>
            {breakdown.length > 0 && (
              <div className="mt-4 space-y-1 border-t border-border/60 pt-3">
                {breakdown.map((r) =>
                  r.to ? (
                    <Link
                      key={r.label}
                      to={r.to}
                      className="press -mx-1.5 flex items-center justify-between rounded-md px-1.5 py-1.5 text-sm transition-colors hover:bg-muted/50 active:bg-muted/60"
                    >
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {r.label}
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </span>
                      <span className="font-mono tabular-nums text-foreground">
                        {formatCurrency(r.amount, r.currency)}
                      </span>
                    </Link>
                  ) : (
                    <div key={r.label} className="flex items-center justify-between px-1.5 py-1.5 text-sm">
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className="font-mono tabular-nums text-foreground">
                        {formatCurrency(r.amount, r.currency)}
                      </span>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Attention banner: the treasurer's first question, answered up top */}
      {!isMemberOnly && (
        overdueMembers.length > 0 ? (
          <Link
            to="/members?atencion=1"
            className="press block rounded-xl border border-overdue/40 bg-overdue/10 p-4 md:p-5 animate-fade-in"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-6 w-6 text-overdue shrink-0 mt-0.5" />
                <div>
                  <p className="text-base md:text-lg font-semibold text-foreground">
                    {t('dashboard.attentionCount', { count: overdueMembers.length })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('dashboard.attentionTotal', { amount: formatCurrency(attentionTotal) })}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-overdue shrink-0" />
            </div>
          </Link>
        ) : (
          <div className="rounded-xl border border-success/30 bg-success/10 p-4 md:p-5 flex items-center gap-3 animate-fade-in">
            <Users className="h-6 w-6 text-success shrink-0" />
            <p className="text-base md:text-lg font-semibold text-foreground">
              {t('dashboard.allMembersUpToDate')}
            </p>
          </div>
        )
      )}

      {/* Primary balances: the three accounts, money at a glance.
          Full-width on phone so large amounts never truncate. */}
      {isMemberOnly && <h2 className="section-header">Tesorería de la logia</h2>}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <StatCard
          title={t('dashboard.totalARSBalance')}
          value={formatCurrency(showTotalARS)}
          subtitle={t('dashboard.bankLodgeCombined')}
          icon={<Wallet className="h-8 w-8 text-primary/30" />}
          variant={showTotalARS >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          title={t('dashboard.bankMainAccount')}
          value={formatCurrency(showBank)}
          subtitle={`${t('dashboard.greatLodgeAccount')}: ${formatCurrency(showGreatLodge)}`}
          icon={<Landmark className="h-8 w-8 text-primary/30" />}
          variant={showBank >= 0 ? 'success' : 'danger'}
          to={!isMemberOnly ? '/transactions' : undefined}
        />
        <StatCard
          title={t('dashboard.savingsAccount')}
          value={formatCurrency(showSavings, 'USD')}
          subtitle={t('dashboard.usdSavings')}
          icon={<Wallet className="h-8 w-8 text-success/30" />}
          variant={showSavings >= 0 ? 'success' : 'danger'}
        />
      </div>

      {/* Overdue Members - hidden for member-only users */}
      {!isMemberOnly && (
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header mb-0">{t('dashboard.membersRequiringAttention')}</h2>
            <Link to="/members?atencion=1">
              <Button variant="ghost" size="sm">
                {t('common.viewAll')} <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
          {overdueMembers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-success/30 mx-auto mb-2" />
              <p className="text-muted-foreground">{t('dashboard.allMembersUpToDate')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {overdueMembers.map((member) => {
                const monthlyDebt = capitaOwed(member, eventTotals);
                const eventDebt = memberEventDebts[member.member_id] || 0;
                const monthlyFeeRate = effectiveFees[member.fee_type] || 0;
                const isMonthlyOverdue = monthlyDebt > monthlyFeeRate;
                const hasEventDebt = eventDebt > 0;
                const eventStatus = memberEventStatuses[member.member_id];
                const isEventMoroso = !!eventStatus?.moroso;
                const isEventDemorado = !!eventStatus?.demorado && !isEventMoroso;
                
                return (
                  <div
                    key={member.member_id}
                    className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{displayName(member.full_name, member.phone_number)}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                        {isMonthlyOverdue && (
                          <span className="text-destructive">
                            {t('dashboard.fees')}: {formatCurrency(monthlyDebt)}
                          </span>
                        )}
                        {hasEventDebt && (
                          <span className="text-warning">
                            {t('dashboard.event')}: {formatCurrency(eventDebt)}
                          </span>
                        )}
                        {!isMonthlyOverdue && !hasEventDebt && monthlyDebt > 0 && (
                          <span className="text-muted-foreground">
                            {t('dashboard.owes')} {formatCurrency(monthlyDebt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
                      {isMonthlyOverdue && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                          {t('dashboard.fees')}
                        </span>
                      )}
                      {isEventMoroso && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                          Evento demorado
                        </span>
                      )}
                      {isEventDemorado && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">
                          Evento impago
                        </span>
                      )}
                      {hasEventDebt && !isEventMoroso && !isEventDemorado && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                          {t('dashboard.event')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Secondary metrics (treasurer aggregates about other members), hidden from member-only users */}
      {!isMemberOnly && (
      <Collapsible className="rounded-xl border bg-card">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&[data-state=open]>svg]:rotate-180">
          <span>{t('dashboard.financialDetail')}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3 pb-3 md:px-4 md:pb-4">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard
              title={t('dashboard.accountYield')}
              value={formatCurrency(totalMonthlyYield)}
              subtitle={`${t('dashboard.annual')}: ${formatCurrency(totalAnnualYield)}`}
              icon={<TrendingUp className="h-8 w-8 text-success/30" />}
              variant={totalMonthlyYield >= 0 ? 'success' : 'default'}
            />
            <StatCard
              title={t('dashboard.monthlyFlow')}
              value={formatCurrency(monthlyIncome - monthlyExpenses)}
              subtitle={`+${formatCurrency(monthlyIncome)} / -${formatCurrency(monthlyExpenses)}`}
              icon={<TrendingUp className="h-8 w-8 text-success/30" />}
              variant={monthlyIncome - monthlyExpenses >= 0 ? 'success' : 'danger'}
            />
            <StatCard
              title={t('dashboard.loansDueUSD')}
              value={formatCurrency(totalLoansDueUSD, 'USD')}
              subtitle={`ARS: ${formatCurrency(totalLoansDueARS)}\n${t('dashboard.activeLoans', { count: loansUSD.length + loansARS.length })}`}
              icon={<HandCoins className="h-8 w-8 text-warning/40" />}
              variant={totalLoansDueUSD > 0 ? 'warning' : 'success'}
              to={!isMemberOnly ? '/loans' : undefined}
            />
            <StatCard
              title={t('dashboard.membersUnpaid')}
              value={membersUnpaid}
              subtitle={t('dashboard.ofActiveMembers', { count: activeMembersCount })}
              icon={<Users className="h-8 w-8 text-warning/40" />}
              variant={membersUnpaid > 0 ? 'warning' : 'success'}
              to="/members"
            />
            <StatCard
              title={t('dashboard.membersOverdue')}
              value={membersOverdue}
              subtitle={t('dashboard.oweMoreThanOne')}
              icon={<AlertTriangle className="h-8 w-8 text-overdue/50" />}
              variant={membersOverdue > 0 ? 'danger' : 'success'}
              to="/members"
            />
            <StatCard
              title={t('dashboard.eventDemorado')}
              value={eventDemoradoCount}
              subtitle={t('dashboard.eventDemoradoHint')}
              icon={<AlertTriangle className="h-8 w-8 text-warning/40" />}
              variant={eventDemoradoCount > 0 ? 'warning' : 'success'}
            />
            <StatCard
              title={t('dashboard.eventMoroso')}
              value={eventMorosoCount}
              subtitle={t('dashboard.eventMorosoHint')}
              icon={<AlertTriangle className="h-8 w-8 text-overdue/50" />}
              variant={eventMorosoCount > 0 ? 'danger' : 'success'}
            />
            {!isMemberOnly && pendingRemindersCount > 0 && (
              <StatCard
                title={t('dashboard.pendingReminders')}
                value={pendingRemindersCount}
                subtitle={t('dashboard.pendingRemindersHint')}
                icon={<MessageSquare className="h-8 w-8 text-primary/40" />}
                variant="warning"
                to="/recordatorios"
              />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
      )}

      {/* Member Fee Matrix */}
      <MemberFeeMatrix
        filterMemberId={isMemberOnly ? (userMemberId ?? null) : undefined}
        referenceMonth={selectedDate}
        adjustedTotalPaid={adjustedTotalPaidMap}
      />
    </div>
  );
}
