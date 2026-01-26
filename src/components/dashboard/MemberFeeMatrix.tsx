import { useMemo } from 'react';
import { format, subMonths, addMonths, startOfMonth, isBefore, isAfter, isSameMonth, parseISO } from 'date-fns';
import { useMembers } from '@/hooks/useMembers';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

type PaymentStatus = 'paid' | 'overdue' | 'current_unpaid' | 'future' | 'not_member';

export function MemberFeeMatrix() {
  const { memberBalances, isLoading: membersLoading } = useMembers();
  const { monthlyFees, isLoading: feesLoading } = useMonthlyFees();

  const isLoading = membersLoading || feesLoading;

  // Generate array of 7 months: 3 past, current, 3 future
  const months = useMemo(() => {
    const now = new Date();
    const result = [];
    for (let i = -3; i <= 3; i++) {
      const monthDate = startOfMonth(i < 0 ? subMonths(now, Math.abs(i)) : i > 0 ? addMonths(now, i) : now);
      result.push({
        date: monthDate,
        key: format(monthDate, 'yyyy-MM-dd'),
        label: format(monthDate, 'MMM'),
        year: format(monthDate, 'yyyy'),
        isCurrent: i === 0,
        isFuture: i > 0,
        isPast: i < 0,
      });
    }
    return result;
  }, []);

  // Get fee rate for a specific month and fee type
  const getFeeForMonth = (monthKey: string, feeType: 'standard' | 'solidarity'): number => {
    const fee = monthlyFees.find(
      (f) => f.year_month === monthKey && f.fee_type === feeType
    );
    return fee?.amount ?? 0;
  };

  // Calculate payment status for each member/month
  const getMemberMonthStatus = (
    member: typeof memberBalances[0],
    monthDate: Date,
    monthKey: string,
    isCurrent: boolean,
    isFuture: boolean
  ): { status: PaymentStatus; amount: number } => {
    const joinDate = parseISO(member.join_date);
    const monthStart = startOfMonth(monthDate);
    const feeAmount = getFeeForMonth(monthKey, member.fee_type);

    // Member wasn't a member yet in this month
    if (isAfter(startOfMonth(joinDate), monthStart)) {
      return { status: 'not_member', amount: 0 };
    }

    // Calculate cumulative fees owed up to and including this month
    let cumulativeOwed = 0;
    const memberJoinMonth = startOfMonth(joinDate);
    
    for (const m of months) {
      if (isAfter(startOfMonth(parseISO(m.key)), monthStart)) break;
      if (isBefore(startOfMonth(parseISO(m.key)), memberJoinMonth)) continue;
      
      cumulativeOwed += getFeeForMonth(m.key, member.fee_type);
    }

    // If total paid covers cumulative owed, this month is paid (even if future)
    const isPaid = member.total_paid >= cumulativeOwed;

    if (isPaid) {
      return { status: 'paid', amount: feeAmount };
    }

    // Future month - not due yet but not paid in advance
    if (isFuture) {
      return { status: 'future', amount: feeAmount };
    }

    if (isCurrent) {
      return { status: 'current_unpaid', amount: feeAmount };
    }

    return { status: 'overdue', amount: feeAmount };
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusClasses = (status: PaymentStatus): string => {
    switch (status) {
      case 'paid':
        return 'bg-success/20 text-success border-success/30';
      case 'overdue':
        return 'bg-destructive/20 text-destructive border-destructive/30';
      case 'current_unpaid':
        return 'bg-warning/20 text-warning border-warning/30';
      case 'future':
        return 'bg-muted/50 text-muted-foreground border-border';
      case 'not_member':
        return 'bg-transparent text-muted-foreground/50';
      default:
        return '';
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const activeMembers = memberBalances.filter((m) => m.is_active);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg md:text-xl">Monthly Fee Status</CardTitle>
        <CardDescription className="text-xs md:text-sm">
          Payment status for each member across months
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 md:p-6">
        <div className="overflow-x-auto -mx-3 md:mx-0">
          <div className="min-w-[600px] px-3 md:px-0">
            <Table>
              <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10">Member</TableHead>
                {months.map((month) => (
                  <TableHead
                    key={month.key}
                    className={cn(
                      'text-center min-w-[80px]',
                      month.isCurrent && 'bg-primary/10'
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">{month.label}</span>
                      <span className="text-xs text-muted-foreground">{month.year}</span>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No active members
                  </TableCell>
                </TableRow>
              ) : (
                activeMembers.map((member) => (
                  <TableRow key={member.member_id}>
                    <TableCell className="sticky left-0 bg-card z-10 font-medium">
                      {member.full_name}
                    </TableCell>
                    {months.map((month) => {
                      const { status, amount } = getMemberMonthStatus(
                        member,
                        month.date,
                        month.key,
                        month.isCurrent,
                        month.isFuture
                      );
                      return (
                        <TableCell
                          key={month.key}
                          className={cn(
                            'text-center p-1',
                            month.isCurrent && 'bg-primary/5'
                          )}
                        >
                          {status !== 'not_member' ? (
                            <div
                              className={cn(
                                'rounded-md px-2 py-1 text-xs font-mono border',
                                getStatusClasses(status)
                              )}
                            >
                              {formatCurrency(amount)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
            </Table>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 md:gap-4 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-success/20 border border-success/30" />
            <span>Paid</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-warning/20 border border-warning/30" />
            <span>Current (unpaid)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/30" />
            <span>Overdue</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-muted/50 border border-border" />
            <span>Future</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
