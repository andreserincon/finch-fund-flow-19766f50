import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { cn, formatCurrencyCompact } from '@/lib/utils';
import { LodgeLoader } from '@/components/lodge/LodgeLoader';

type PaymentStatus = 'paid' | 'overdue' | 'current_unpaid' | 'future' | 'not_member';

interface MemberFeeMatrixProps {
  filterMemberId?: string | null | undefined;
  /** When provided, centers the month window around this date instead of today */
  referenceMonth?: Date;
  /** When provided, overrides member.total_paid with the value from this map */
  adjustedTotalPaid?: Record<string, number>;
}

// Generate all months from a start date to an end date (inclusive), as
// "yyyy-MM-dd" first-of-month keys.
function generateMonthRange(startDate: Date, endDate: Date): string[] {
  const result: string[] = [];
  let current = startOfMonth(startDate);
  const end = startOfMonth(endDate);
  while (!isAfter(current, end)) {
    result.push(format(current, 'yyyy-MM-dd'));
    current = addMonths(current, 1);
  }
  return result;
}

function getStatusClasses(status: PaymentStatus): string {
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
}

export function MemberFeeMatrix({ filterMemberId, referenceMonth, adjustedTotalPaid }: MemberFeeMatrixProps) {
  const { t } = useTranslation();
  const [showAllMembers, setShowAllMembers] = useState(false);
  const isMobile = useIsMobile();
  const { displayName } = useHiddenMode();
  const { memberBalances, isLoading: membersLoading } = useMembers();
  const { monthlyFees, isLoading: feesLoading } = useMonthlyFees();
  const { history, isLoading: historyLoading } = useMemberFeeTypeHistory();

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

  // Get effective total_paid for a member (use adjusted if available)
  const getEffectiveTotalPaid = (member: typeof memberBalances[0]): number => {
    if (adjustedTotalPaid && member.member_id in adjustedTotalPaid) {
      return adjustedTotalPaid[member.member_id];
    }
    return member.total_paid;
  };

  // Precompute, ONCE per data change, each active member's per-month
  // {status, amount} for the visible window plus whether they have any
  // unpaid/overdue cell. The filter, sort, count, and render below all read
  // from this map instead of re-walking each member's history on every render
  // (previously done per cell, again in the sort, and again in the count).
  // The math is identical to the prior per-cell version, just done once and
  // with the cumulative owed accumulated across the window instead of summed
  // from the join date for every single cell.
  const memberStatus = useMemo(() => {
    const feeRate = new Map<string, number>();
    for (const f of monthlyFees) feeRate.set(`${f.year_month}|${f.fee_type}`, f.amount);
    const feeFor = (monthKey: string, feeType: string) => feeRate.get(`${monthKey}|${feeType}`) ?? 0;

    // history is ordered effective_from DESC; group by member, preserving order.
    const histByMember = new Map<string, { effective_from: string; fee_type: string }[]>();
    for (const h of history) {
      const arr = histByMember.get(h.member_id);
      if (arr) arr.push(h);
      else histByMember.set(h.member_id, [h]);
    }
    const feeTypeFor = (memberId: string, monthKey: string, fallback: string): string => {
      const arr = histByMember.get(memberId);
      if (arr) {
        for (const r of arr) if (r.effective_from <= monthKey) return r.fee_type;
      }
      return fallback;
    };

    const map = new Map<
      string,
      { perMonth: Record<string, { status: PaymentStatus; amount: number }>; hasUnpaid: boolean }
    >();

    for (const member of memberBalances) {
      if (!member.is_active) continue;
      const joinMonth = startOfMonth(parseISO(member.join_date));
      const totalPaid = getEffectiveTotalPaid(member);
      const perMonth: Record<string, { status: PaymentStatus; amount: number }> = {};
      let hasUnpaid = false;
      let cumulativeOwed: number | null = null;

      for (const month of months) {
        const monthStart = month.date;
        const monthKey = month.key;

        if (isAfter(joinMonth, monthStart)) {
          perMonth[monthKey] = { status: 'not_member', amount: 0 };
          continue;
        }

        const feeAmount = feeFor(monthKey, feeTypeFor(member.member_id, monthKey, member.fee_type));

        if (cumulativeOwed === null) {
          // First in-range month: seed with the full owed sum from join month.
          let c = 0;
          for (const mKey of generateMonthRange(joinMonth, monthStart)) {
            c += feeFor(mKey, feeTypeFor(member.member_id, mKey, member.fee_type));
          }
          cumulativeOwed = c;
        } else {
          cumulativeOwed += feeAmount;
        }

        const prevMonthOwed = cumulativeOwed - feeAmount;
        const isPaid = totalPaid >= cumulativeOwed;

        let status: PaymentStatus;
        let amount: number;
        if (isPaid) {
          status = 'paid';
          amount = feeAmount;
        } else {
          amount = totalPaid >= prevMonthOwed ? cumulativeOwed - totalPaid : feeAmount;
          status = month.isFuture ? 'future' : month.isCurrent ? 'current_unpaid' : 'overdue';
        }

        perMonth[monthKey] = { status, amount };
        if (status === 'current_unpaid' || status === 'overdue') hasUnpaid = true;
      }

      map.set(member.member_id, { perMonth, hasUnpaid });
    }

    return map;
    // getEffectiveTotalPaid is a pure read of adjustedTotalPaid (in deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberBalances, monthlyFees, history, months, adjustedTotalPaid]);

  const displayedMembers = useMemo(() => {
    const filtered = memberBalances.filter((m) => {
      if (!m.is_active) return false;
      if (filterMemberId !== undefined) {
        if (!filterMemberId || m.member_id !== filterMemberId) return false;
      }
      if (!showAllMembers) {
        return memberStatus.get(m.member_id)?.hasUnpaid ?? false;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      const aHasUnpaid = memberStatus.get(a.member_id)?.hasUnpaid ?? false;
      const bHasUnpaid = memberStatus.get(b.member_id)?.hasUnpaid ?? false;

      if (aHasUnpaid === bHasUnpaid) {
        const aTotalPaid = getEffectiveTotalPaid(a);
        const bTotalPaid = getEffectiveTotalPaid(b);
        return (bTotalPaid - b.total_fees_owed) - (aTotalPaid - a.total_fees_owed);
      }

      return aHasUnpaid ? -1 : 1;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberBalances, showAllMembers, filterMemberId, memberStatus, adjustedTotalPaid]);

  const paidMembersCount = useMemo(() => {
    if (filterMemberId !== undefined) return 0;
    let count = 0;
    for (const m of memberBalances) {
      if (m.is_active && !(memberStatus.get(m.member_id)?.hasUnpaid ?? false)) count++;
    }
    return count;
  }, [memberBalances, filterMemberId, memberStatus]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <LodgeLoader />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg md:text-xl font-display">
              {filterMemberId !== undefined ? 'Tu cuota por mes' : t('dashboard.feeMatrixTitle')}
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">
              {filterMemberId !== undefined ? 'Tu estado de capitas por mes' : t('dashboard.feeMatrixDesc')}
            </CardDescription>
          </div>
          {filterMemberId === undefined && (
            <div className="flex items-center space-x-2">
              <Switch
                id="show-all-members"
                checked={showAllMembers}
                onCheckedChange={setShowAllMembers}
              />
              <Label htmlFor="show-all-members" className="text-xs md:text-sm cursor-pointer">
                {t('dashboard.feeMatrixShowAll', { count: paidMembersCount })}
              </Label>
            </div>
          )}
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
                    {showAllMembers ? t('dashboard.feeMatrixNoActive') : t('dashboard.feeMatrixAllUpToDate')}
                  </TableCell>
                </TableRow>
              ) : (
                displayedMembers.map((member) => {
                  const perMonth = memberStatus.get(member.member_id)?.perMonth;
                  return (
                  <TableRow key={member.member_id}>
                    <TableCell className="sticky left-0 bg-card z-10 font-medium">
                      {displayName(member.full_name, member.phone_number)}
                    </TableCell>
                    {months.map((month) => {
                      const { status, amount } = perMonth?.[month.key] ?? { status: 'not_member' as PaymentStatus, amount: 0 };
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
                              {formatCurrencyCompact(amount)}
                            </div>
                          ) : (
                            <span className="text-muted-foreground/30 text-[10px]">n/c</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  );
                })
              )}
            </TableBody>
            </Table>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 md:gap-4 mt-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-success/20 border border-success/30" />
            <span>{t('dashboard.statusPaid')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-warning/20 border border-warning/30" />
            <span>{t('dashboard.statusCurrentUnpaid')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-destructive/20 border border-destructive/30" />
            <span>{t('dashboard.statusOverdue')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-muted/50 border border-border" />
            <span>{t('dashboard.statusFuture')}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
