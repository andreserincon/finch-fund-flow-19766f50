import { useMemo, useState } from 'react';
import { format, subMonths, addMonths, startOfMonth, isBefore, isAfter, parseISO } from 'date-fns';
import { useMembers } from '@/hooks/useMembers';
import { useMonthlyFees } from '@/hooks/useMonthlyFees';
import { useMemberFeeTypeHistory } from '@/hooks/useMemberFeeTypeHistory';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type PaymentStatus = 'paid' | 'overdue' | 'current_unpaid' | 'future' | 'not_member';

export function MemberFeeMatrix({ filterMemberId }: { filterMemberId?: string | null | undefined }) {
  const [showAllMembers, setShowAllMembers] = useState(false);
  const isMobile = useIsMobile();
  const { memberBalances, isLoading: membersLoading } = useMembers();
  const { monthlyFees, isLoading: feesLoading } = useMonthlyFees();
  const { getFeeTypeForMonth: getHistoricalFeeType, isLoading: historyLoading } = useMemberFeeTypeHistory();

  const isLoading = membersLoading || feesLoading || historyLoading;

  // Generate array of months: 1 month for mobile (current only), 7 months for desktop (3 past, current, 3 future)
  const months = useMemo(() => {
    const now = new Date();
    const result = [];
    const startOffset = isMobile ? 0 : -3;
    const endOffset = isMobile ? 0 : 3;
    
    for (let i = startOffset; i <= endOffset; i++) {
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
  }, [isMobile]);

  // Get fee rate for a specific month and fee type
  const getFeeForMonth = (monthKey: string, feeType: 'standard' | 'solidarity'): number => {
    const fee = monthlyFees.find(
      (f) => f.year_month === monthKey && f.fee_type === feeType
    );
    return fee?.amount ?? 0;
  };

  // Get the fee type for a member at a specific month (uses history for non-retroactive changes)
  const getMemberFeeTypeForMonth = (memberId: string, monthKey: string, currentFeeType: 'standard' | 'solidarity'): 'standard' | 'solidarity' => {
    const historicalFeeType = getHistoricalFeeType(memberId, monthKey);
    return historicalFeeType ?? currentFeeType;
  };

  // Generate all months from a start date to an end date for cumulative calculation
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
    
    // Get the fee type that was active for this member during this month
    const effectiveFeeType = getMemberFeeTypeForMonth(member.member_id, monthKey, member.fee_type);
    const feeAmount = getFeeForMonth(monthKey, effectiveFeeType);

    // Member wasn't a member yet in this month
    if (isAfter(startOfMonth(joinDate), monthStart)) {
      return { status: 'not_member', amount: 0 };
    }

    // Calculate cumulative fees owed up to and including this month
    // Use the full range from join date to the displayed month, not the limited display array
    let cumulativeOwed = 0;
    const memberJoinMonth = startOfMonth(joinDate);
    const allMonthsToCalculate = generateMonthRange(memberJoinMonth, monthStart);
    
    for (const mKey of allMonthsToCalculate) {
      // Use historical fee type for each month
      const monthFeeType = getMemberFeeTypeForMonth(member.member_id, mKey, member.fee_type);
      cumulativeOwed += getFeeForMonth(mKey, monthFeeType);
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

  // Helper to check if member has unpaid/overdue status
  const memberHasUnpaidOrOverdue = (member: typeof memberBalances[0]) => {
    return months.some((month) => {
      const { status } = getMemberMonthStatus(
        member,
        month.date,
        month.key,
        month.isCurrent,
        month.isFuture
      );
      return status === 'current_unpaid' || status === 'overdue';
    });
  };

  // Filter and sort members based on toggle state
  const displayedMembers = useMemo(() => {
    let filtered = memberBalances.filter((m) => {
      if (!m.is_active) return false;
      if (filterMemberId !== undefined) {
        if (!filterMemberId || m.member_id !== filterMemberId) return false;
      }
      if (!showAllMembers) {
        return memberHasUnpaidOrOverdue(m);
      }
      return true;
    });

    // Sort: members with unpaid/overdue first (by balance desc), then paid members (by balance desc)
    return filtered.sort((a, b) => {
      const aHasUnpaid = memberHasUnpaidOrOverdue(a);
      const bHasUnpaid = memberHasUnpaidOrOverdue(b);
      
      // If both have same unpaid status, sort by current_balance descending
      if (aHasUnpaid === bHasUnpaid) {
        return (b.current_balance ?? 0) - (a.current_balance ?? 0);
      }
      
      // Members with unpaid/overdue come first
      return aHasUnpaid ? -1 : 1;
    });
  }, [memberBalances, showAllMembers, months, filterMemberId]);

  const paidMembersCount = memberBalances.filter(m => m.is_active && !memberHasUnpaidOrOverdue(m)).length;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg md:text-xl">Estado de Capitas Mensuales</CardTitle>
            <CardDescription className="text-xs md:text-sm">
              Estado de pago de cada miembro por mes
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="show-all-members"
              checked={showAllMembers}
              onCheckedChange={setShowAllMembers}
            />
            <Label htmlFor="show-all-members" className="text-xs md:text-sm cursor-pointer">
              Mostrar miembros al día ({paidMembersCount})
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 md:p-6">
        <div className={cn("overflow-x-auto", !isMobile && "-mx-3 md:mx-0")}>
          <div className={cn(!isMobile && "min-w-[600px]", "px-3 md:px-0")}>
            <Table>
              <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-card z-10">Miembro</TableHead>
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
              {displayedMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={months.length + 1} className="text-center py-8 text-muted-foreground">
                    {showAllMembers ? 'No hay miembros activos' : '¡Todos los miembros están al día!'}
                  </TableCell>
                </TableRow>
              ) : (
                displayedMembers.map((member) => (
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
            <span>Pagado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-warning/20 border border-warning/30" />
            <span>Actual (impago)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/30" />
            <span>Demorado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-muted/50 border border-border" />
            <span>Futuro</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
