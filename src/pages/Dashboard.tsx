import { useMembers } from '@/hooks/useMembers';
import { useTransactions } from '@/hooks/useTransactions';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { StatCard } from '@/components/dashboard/StatCard';
import { MemberStatusBadge } from '@/components/dashboard/MemberStatusBadge';
import { MemberFeeMatrix } from '@/components/dashboard/MemberFeeMatrix';
import { useAccountTransfers } from '@/hooks/useAccountTransfers';
import { useLoans } from '@/hooks/useLoans';
import { AddTransactionForm } from '@/components/forms/AddTransactionForm';
import { 
  Wallet, 
  Users, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Building,
  Landmark,
  HandCoins
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CATEGORY_LABELS } from '@/lib/types';

export default function Dashboard() {
  const { memberBalances, isLoading: membersLoading } = useMembers();
  const { transactions, isLoading: transactionsLoading } = useTransactions();
  const { currentMonthFees, isLoading: feesLoading } = useMonthlyFees();
  const { transfers, isLoading: transfersLoading } = useAccountTransfers();
  const { loans, isLoading: loansLoading } = useLoans();
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

  const recentTransactions = transactions.slice(0, 5);
  
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
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Financial overview for {format(new Date(), 'MMMM yyyy')}
          </p>
        </div>
        <AddTransactionForm triggerLabel="Log Transaction" />
      </div>

      {/* Key Metrics - Row 1 */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Bank Main Account"
          value={formatCurrency(bankBalance)}
          subtitle="Primary bank balance"
          icon={<Landmark className="h-8 w-8 text-primary/20" />}
          variant={bankBalance >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          title="Great Lodge Account"
          value={formatCurrency(greatLodgeBalance)}
          subtitle="Lodge balance"
          icon={<Building className="h-8 w-8 text-primary/20" />}
          variant={greatLodgeBalance >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          title="Total ARS Balance"
          value={formatCurrency(totalARSBalance)}
          subtitle="Bank + Lodge combined"
          icon={<Wallet className="h-8 w-8 text-primary/20" />}
          variant={totalARSBalance >= 0 ? 'success' : 'danger'}
        />
      </div>

      {/* Key Metrics - Row 2 */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Savings Account"
          value={formatCurrency(savingsBalance, 'USD')}
          subtitle="USD savings"
          icon={<Wallet className="h-8 w-8 text-success/20" />}
          variant={savingsBalance >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          title="Loans Due (USD)"
          value={formatCurrency(totalLoansDueUSD, 'USD')}
          subtitle={`${loansUSD.length} active loan${loansUSD.length !== 1 ? 's' : ''}`}
          icon={<HandCoins className="h-8 w-8 text-warning/20" />}
          variant={totalLoansDueUSD > 0 ? 'warning' : 'success'}
        />
        <StatCard
          title="Monthly Flow"
          value={formatCurrency(monthlyIncome - monthlyExpenses)}
          subtitle={`+${formatCurrency(monthlyIncome)} / -${formatCurrency(monthlyExpenses)}`}
          icon={<TrendingUp className="h-8 w-8 text-success/20" />}
          variant={monthlyIncome - monthlyExpenses >= 0 ? 'success' : 'danger'}
        />
      </div>

      {/* Key Metrics - Row 3 */}
      <div className="grid gap-3 grid-cols-2">
        <StatCard
          title="Members Unpaid"
          value={membersUnpaid}
          subtitle={`of ${activeMembersCount} active members`}
          icon={<Users className="h-8 w-8 text-warning/20" />}
          variant={membersUnpaid > 0 ? 'warning' : 'success'}
        />
        <StatCard
          title="Members Overdue"
          value={membersOverdue}
          subtitle={`owe > 1 monthly fee`}
          icon={<AlertTriangle className="h-8 w-8 text-overdue/20" />}
          variant={membersOverdue > 0 ? 'danger' : 'success'}
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Transactions */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header mb-0">Recent Transactions</h2>
            <Link to="/transactions">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
          {recentTransactions.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No transactions yet
            </p>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {CATEGORY_LABELS[transaction.category]}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(transaction.transaction_date), 'MMM d, yyyy')}
                      {transaction.member && ` • ${transaction.member.full_name}`}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'font-mono text-sm font-semibold',
                      transaction.transaction_type === 'income'
                        ? 'amount-positive'
                        : 'amount-negative'
                    )}
                  >
                    {transaction.transaction_type === 'income' ? '+' : '-'}
                    {formatCurrency(transaction.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overdue Members */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-header mb-0">Members Requiring Attention</h2>
            <Link to="/members">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
          {overdueMembers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-success/30 mx-auto mb-2" />
              <p className="text-muted-foreground">All members are up to date!</p>
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
                            Fees: {formatCurrency(monthlyDebt)}
                          </span>
                        )}
                        {hasEventDebt && (
                          <span className="text-warning">
                            Events: {formatCurrency(eventDebt)}
                          </span>
                        )}
                        {!isMonthlyOverdue && !hasEventDebt && monthlyDebt > 0 && (
                          <span className="text-muted-foreground">
                            Owes {formatCurrency(monthlyDebt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {isMonthlyOverdue && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive font-medium">
                          Fees
                        </span>
                      )}
                      {hasEventDebt && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning font-medium">
                          Event
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Member Fee Matrix */}
      <MemberFeeMatrix />
    </div>
  );
}
