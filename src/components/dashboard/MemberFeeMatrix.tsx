import { useMemo, useState } from 'react';
import { useHiddenMode } from '@/contexts/HiddenModeContext';
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

interface MemberFeeMatrixProps {
  filterMemberId?: string | null | undefined;
  /** When provided, centers the month window around this date instead of today */
  referenceMonth?: Date;
  /** When provided, overrides member.total_paid with the value from this map */
  adjustedTotalPaid?: Record<string, number>;
}

export function MemberFeeMatrix({ filterMemberId, referenceMonth, adjustedTotalPaid }: MemberFeeMatrixProps) {
  const [showAllMembers, setShowAllMembers] = useState(false);
  const isMobile = useIsMobile();
  const { displayName } = useHiddenMode();
  const { memberBalances, isLoading: membersLoading } = useMembers();
  const { monthlyFees, isLoading: feesLoading } = useMonthlyFees();
  const { getFeeTypeForMonth: getHistoricalFeeType, isLoading: historyLoading } = useMemberFeeTypeHistory();

  const isLoading = membersLoading || feesLoading || historyLoading;

  const refDate = referenceMonth ?? new Date();

  // Generate array of months centered on the reference date
  const months = useMemo(() => {
    const result = [];
    const startOffset = isMobile ? 0 : -3;
    const endOffset = isMobile ? 0 : 3;
    
    for (let i = startOffset; i <= endOffset; i++) {
      const monthDate = startOfMonth(i < 0 ? subMonths(refDate, Math.abs(i)) : i > 0 ? addMonths(refDate, i) : refDate);
      const isRef = i === 0;
      // Determine if a month is truly "future" relative to the reference
      const nowMonth = startOfMonth(new Date());
      result.push({
        date: monthDate,
        key: format(monthDate, 'yyyy-MM-dd'),
        label: format(monthDate, 'MMM'),
        year: format(monthDate, 'yyyy'),
        isCurrent: isRef,
        isFuture: isAfter(monthDate, startOfMonth(refDate)),
        isPast: isBefore(monthDate, startOfMonth(refDate)),
      });
    }
    return result;
  }, [isMobile, refDate]);

  // Get fee rate for a specific month and fee type
  const getFeeForMonth = (monthKey: string, feeType: 'standard' | 'solidarity'): number => {
    const fee = monthlyFees.find(
      (f) => f.year_month === monthKey && f.fee_type === feeType
    );
    return fee?.amount ?? 0;
  };

  // Get the fee type for a member at a specific month
  const getMemberFeeTypeForMonth = (memberId: string, monthKey: string, currentFeeType: 'standard' | 'solidarity'): 'standard' | 'solidarity' => {
    const historicalFeeType = getHistoricalFeeType(memberId, monthKey);
    return historicalFeeType ?? currentFeeType;
  };

  // Generate all months from a start date to an end date
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

  // Get effective total_paid for a member (use adjusted if available)
  const getEffectiveTotalPaid = (member: typeof memberBalances[0]): number => {
    if (adjustedTotalPaid && member.member_id in adjustedTotalPaid) {
      return adjustedTotalPaid[member.member_id];
    }
    return member.total_paid;
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
    
    const effectiveFeeType = getMemberFeeTypeForMonth(member.member_id, monthKey, member.fee_type);
    const feeAmount = getFeeForMonth(monthKey, effectiveFeeType);

    if (isAfter(startOfMonth(joinDate), monthStart)) {
      return { status: 'not_member', amount: 0 };
    }

    let cumulativeOwed = 0;
    const memberJoinMonth = startOfMonth(joinDate);
    const allMonthsToCalculate = generateMonthRange(memberJoinMonth, monthStart);
    
    for (const mKey of allMonthsToCalculate) {
      const monthFeeType = getMemberFeeTypeForMonth(member.member_id, mKey, member.fee_type);
      cumulativeOwed += getFeeForMonth(mKey, monthFeeType);
    }

    const prevMonthOwed = cumulativeOwed - feeAmount;
    const totalPaid = getEffectiveTotalPaid(member);
    const isPaid = totalPaid >= cumulativeOwed;

    if (isPaid) {
      return { status: 'paid', amount: feeAmount };
    }

    const pendingAmount = totalPaid >= prevMonthOwed
      ? cumulativeOwed - totalPaid
      : feeAmount;

    if (isFuture) {
      return { status: 'future', amount: pendingAmount };
    }

    if (isCurrent) {
      return { status: 'current_unpaid', amount: pendingAmount };
    }

    return { status: 'overdue', amount: pendingAmount };
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

    return filtered.sort((a, b) => {
      const aHasUnpaid = memberHasUnpaidOrOverdue(a);
      const bHasUnpaid = memberHasUnpaidOrOverdue(b);
      
      if (aHasUnpaid === bHasUnpaid) {
        const aTotalPaid = getEffectiveTotalPaid(a);
        const bTotalPaid = getEffectiveTotalPaid(b);
        return (bTotalPaid - b.total_fees_owed) - (aTotalPaid - a.total_fees_owed);
      }
      
      return aHasUnpaid ? -1 : 1;
    });
  }, [memberBalances, showAllMembers, months, filterMemberId, adjustedTotalPaid]);

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
                      {displayName(member.full_name, member.phone_number)}
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
