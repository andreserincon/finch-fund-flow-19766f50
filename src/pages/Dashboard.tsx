import { useMembers } from '@/hooks/useMembers';
import { useTransactions } from '@/hooks/useTransactions';
import { StatCard } from '@/components/dashboard/StatCard';
import { MemberStatusBadge } from '@/components/dashboard/MemberStatusBadge';
import { AddTransactionForm } from '@/components/forms/AddTransactionForm';
import { 
  Wallet, 
  Building2, 
  Users, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CATEGORY_LABELS } from '@/lib/types';

export default function Dashboard() {
  const { memberBalances, isLoading: membersLoading } = useMembers();
  const { transactions, isLoading: transactionsLoading } = useTransactions();

  const isLoading = membersLoading || transactionsLoading;

  // Calculate stats
  const totalBalance = transactions.reduce((sum, t) => {
    return sum + (t.transaction_type === 'income' ? t.amount : -t.amount);
  }, 0);

  const membersOverdue = memberBalances.filter(m => {
    return m.current_balance < m.total_fees_owed && m.is_active;
  }).length;

  const membersUpToDate = memberBalances.filter(m => {
    return m.current_balance >= m.total_fees_owed && m.is_active;
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
  const overdueMembers = memberBalances
    .filter(m => m.current_balance < m.total_fees_owed && m.is_active)
    .slice(0, 5);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'EUR',
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
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Financial overview for {format(new Date(), 'MMMM yyyy')}
          </p>
        </div>
        <AddTransactionForm triggerLabel="Log Transaction" />
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Balance"
          value={formatCurrency(totalBalance)}
          subtitle="All accounts combined"
          icon={<Wallet className="h-8 w-8 text-primary/20" />}
          variant={totalBalance >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          title="Monthly Income"
          value={formatCurrency(monthlyIncome)}
          subtitle="This month"
          icon={<TrendingUp className="h-8 w-8 text-success/20" />}
          variant="success"
        />
        <StatCard
          title="Monthly Expenses"
          value={formatCurrency(monthlyExpenses)}
          subtitle="This month"
          icon={<TrendingDown className="h-8 w-8 text-overdue/20" />}
          variant="danger"
        />
        <StatCard
          title="Members Overdue"
          value={membersOverdue}
          subtitle={`of ${memberBalances.filter(m => m.is_active).length} active members`}
          icon={<AlertTriangle className="h-8 w-8 text-warning/20" />}
          variant={membersOverdue > 0 ? 'warning' : 'success'}
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
              {overdueMembers.map((member) => (
                <div
                  key={member.member_id}
                  className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{member.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      Owes {formatCurrency(member.total_fees_owed - member.current_balance)}
                    </p>
                  </div>
                  <MemberStatusBadge
                    balance={member.current_balance}
                    totalOwed={member.total_fees_owed}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
