import { useTranslation } from 'react-i18next';
import { useMembers } from '@/hooks/useMembers';
import { useTransactions } from '@/hooks/useTransactions';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/dashboard/StatCard';
import { MemberFeeMatrix } from '@/components/dashboard/MemberFeeMatrix';

import { useAccountTransfers } from '@/hooks/useAccountTransfers';
import { useLoans } from '@/hooks/useLoans';
import { AddTransactionForm } from '@/components/forms/AddTransactionForm';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { 
  Wallet, 
  Users, 
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Building,
  Landmark,
  HandCoins
} from 'lucide-react';
import { format } from 'date-fns';
import { es, enUS } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';


export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { memberBalances, isLoading: membersLoading } = useMembers();
  const { transactions, isLoading: transactionsLoading } = useTransactions();
  const { currentMonthFees, isLoading: feesLoading } = useMonthlyFees();
  const { transfers, isLoading: transfersLoading } = useAccountTransfers();
  const { loans, isLoading: loansLoading } = useLoans();
  const { isAdmin } = useIsAdmin();
  
  const dateLocale = i18n.language === 'es' ? es : enUS;

  // Query unpaid event amounts per member
  const { data: memberEventDebts = {} } = useQuery({
    queryKey: ['member-event-debts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_member_payments')
        .select('member_id, amount_owed, amount_paid');
      
      if (error) throw error;
      
      // Aggregate unpaid event amounts per member
      const debts: Record<string, number> = {};
      data?.forEach((payment) => {
        const unpaid = payment.amount_owed - payment.amount_paid;
        if (unpaid > 0) {
          debts[payment.member_id] = (debts[payment.member_id] || 0) + unpaid;
        }
      });
      return debts;
    },
  });

  const isLoading = membersLoading || transactionsLoading || feesLoading || transfersLoading || loansLoading;

  // Calculate total loans due (ARS and USD separately)
  const activeLoans = loans.filter(l => l.status === 'active');
  const loansARS = activeLoans.filter(l => l.account === 'bank');
  const loansUSD = activeLoans.filter(l => l.account === 'savings');
  const totalLoansDueARS = loansARS.reduce((sum, l) => sum + (l.amount - l.amount_paid), 0);
  const totalLoansDueUSD = loansUSD.reduce((sum, l) => sum + (l.amount - l.amount_paid), 0);


  // Calculate account balances
  const bankBalance = transactions
    .filter(t => t.account === 'bank' || !t.account)
    .reduce((sum, t) => sum + (t.transaction_type === 'income' ? t.amount : -t.amount), 0)
    - transfers.filter(t => t.from_account === 'bank').reduce((sum, t) => sum + t.amount, 0)
    + transfers.filter(t => t.to_account === 'bank').reduce((sum, t) => sum + t.amount, 0);

  const greatLodgeBalance = transactions
    .filter(t => t.account === 'great_lodge')
    .reduce((sum, t) => sum + (t.transaction_type === 'income' ? t.amount : -t.amount), 0)
    - transfers.filter(t => t.from_account === 'great_lodge').reduce((sum, t) => sum + t.amount, 0)
    + transfers.filter(t => t.to_account === 'great_lodge').reduce((sum, t) => sum + t.amount, 0);

  const savingsBalance = transactions
    .filter(t => t.account === 'savings')
    .reduce((sum, t) => sum + (t.transaction_type === 'income' ? t.amount : -t.amount), 0)
    - transfers.filter(t => t.from_account === 'savings').reduce((sum, t) => sum + t.amount, 0)
    + transfers.filter(t => t.to_account === 'savings').reduce((sum, t) => sum + t.amount, 0);

  // Calculate stats (ARS balance excludes savings which is in USD)
  const totalARSBalance = bankBalance + greatLodgeBalance;

  const activeMembersCount = memberBalances.filter(m => m.is_active).length;

  const membersUnpaid = memberBalances.filter(m => {
    if (!m.is_active) return false;
    return m.total_paid < m.total_fees_owed;
  }).length;

  const membersOverdue = memberBalances.filter(m => {
    if (!m.is_active) return false;
    const amountOwed = m.total_fees_owed - m.total_paid;
    const monthlyFeeRate = currentMonthFees[m.fee_type] || 0;
    const hasUnpaidEvents = (memberEventDebts[m.member_id] || 0) > 0;
    return amountOwed > monthlyFeeRate || hasUnpaidEvents;
  }).length;

  const thisMonth = new Date();
  const monthStart = new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1);
  
  const monthlyIncome = transactions
    .filter(t => new Date(t.transaction_date) >= monthStart && t.transaction_type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);

  const monthlyExpenses = transactions
    .filter(t => new Date(t.transaction_date) >= monthStart && t.transaction_type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);



  // Filter members: owe more than 1 monthly fee OR have unpaid events
  const overdueMembers = memberBalances
    .filter(m => {
      if (!m.is_active) return false;
      
      const amountOwed = m.total_fees_owed - m.total_paid;
      const monthlyFeeRate = currentMonthFees[m.fee_type] || 0;
      const hasUnpaidEvents = (memberEventDebts[m.member_id] || 0) > 0;
      
      // Show if they owe more than 1 monthly fee OR have unpaid events
      return amountOwed > monthlyFeeRate || hasUnpaidEvents;
    })
    .sort((a, b) => {
      // Sort by amount owed descending
      const aOwed = a.total_fees_owed - a.total_paid;
      const bOwed = b.total_fees_owed - b.total_paid;
      return bOwed - aOwed;
    })
    .slice(0, 5);

  const formatCurrency = (amount: number, currency: 'ARS' | 'USD' = 'ARS') => {
    return new Intl.NumberFormat(currency === 'ARS' ? 'es-AR' : 'en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }


  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.financialOverview', { month: format(new Date(), 'MMMM yyyy', { locale: dateLocale }) })}
          </p>
        </div>
        {isAdmin && <AddTransactionForm triggerLabel={t('dashboard.logTransaction')} />}
      </div>


      {/* Key Metrics - Balance Summary */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t('dashboard.totalARSBalance')}
          value={formatCurrency(totalARSBalance)}
          subtitle={t('dashboard.bankLodgeCombined')}
          icon={<Wallet className="h-8 w-8 text-primary/20" />}
          variant={totalARSBalance >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          title={t('dashboard.bankMainAccount')}
          value={formatCurrency(bankBalance)}
          subtitle={t('dashboard.primaryBankBalance')}
          icon={<Landmark className="h-8 w-8 text-primary/20" />}
          variant={bankBalance >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          title={t('dashboard.greatLodgeAccount')}
          value={formatCurrency(greatLodgeBalance)}
          subtitle={t('dashboard.lodgeBalance')}
          icon={<Building className="h-8 w-8 text-primary/20" />}
          variant={greatLodgeBalance >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          title={t('dashboard.savingsAccount')}
          value={formatCurrency(savingsBalance, 'USD')}
          subtitle={t('dashboard.usdSavings')}
          icon={<Wallet className="h-8 w-8 text-success/20" />}
          variant={savingsBalance >= 0 ? 'success' : 'danger'}
        />
      </div>

      {/* Key Metrics - Activity */}
      <div className="grid gap-3 grid-cols-2">
        <StatCard
          title={t('dashboard.loansDueUSD')}
          value={formatCurrency(totalLoansDueUSD, 'USD')}
          subtitle={t('dashboard.activeLoans', { count: loansUSD.length })}
          icon={<HandCoins className="h-8 w-8 text-warning/20" />}
          variant={totalLoansDueUSD > 0 ? 'warning' : 'success'}
        />
        <StatCard
          title={t('dashboard.monthlyFlow')}
          value={formatCurrency(monthlyIncome - monthlyExpenses)}
          subtitle={`+${formatCurrency(monthlyIncome)} / -${formatCurrency(monthlyExpenses)}`}
          icon={<TrendingUp className="h-8 w-8 text-success/20" />}
          variant={monthlyIncome - monthlyExpenses >= 0 ? 'success' : 'danger'}
        />
      </div>

      {/* Key Metrics - Row 3 */}
      <div className="grid gap-3 grid-cols-2">
        <StatCard
          title={t('dashboard.membersUnpaid')}
          value={membersUnpaid}
          subtitle={t('dashboard.ofActiveMembers', { count: activeMembersCount })}
          icon={<Users className="h-8 w-8 text-warning/20" />}
          variant={membersUnpaid > 0 ? 'warning' : 'success'}
        />
        <StatCard
          title={t('dashboard.membersOverdue')}
          value={membersOverdue}
          subtitle={t('dashboard.oweMoreThanOne')}
          icon={<AlertTriangle className="h-8 w-8 text-overdue/20" />}
          variant={membersOverdue > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Overdue Members */}
      <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header mb-0">{t('dashboard.membersRequiringAttention')}</h2>
            <Link to="/members">
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
                const monthlyDebt = member.total_fees_owed - member.total_paid;
                const eventDebt = memberEventDebts[member.member_id] || 0;
                const monthlyFeeRate = currentMonthFees[member.fee_type] || 0;
                const isMonthlyOverdue = monthlyDebt > monthlyFeeRate;
                const hasEventDebt = eventDebt > 0;
                
                return (
                  <div
                    key={member.member_id}
                    className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{member.full_name}</p>
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
                    <div className="flex gap-1 flex-shrink-0">
                      {isMonthlyOverdue && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                          {t('dashboard.fees')}
                        </span>
                      )}
                      {hasEventDebt && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">
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

      {/* Member Fee Matrix */}
      <MemberFeeMatrix />
    </div>
  );
}
