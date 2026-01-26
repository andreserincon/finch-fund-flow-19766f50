import * as React from 'react';
import { cn } from '@/lib/utils';
import { PaymentStatus } from '@/lib/types';

interface MemberStatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  balance: number;
  totalOwed: number;
}

export const MemberStatusBadge = React.forwardRef<HTMLSpanElement, MemberStatusBadgeProps>(
  ({ balance, totalOwed, className, ...props }, ref) => {
    const getStatus = (): PaymentStatus => {
      if (balance >= totalOwed) return 'ahead';
      if (balance >= totalOwed - 0.01) return 'up_to_date';
      return 'overdue';
    };

    const status = getStatus();

    const statusConfig = {
      ahead: {
        label: 'Ahead',
        className: 'status-ahead',
      },
      up_to_date: {
        label: 'Up to date',
        className: 'status-up-to-date',
      },
      overdue: {
        label: 'Overdue',
        className: 'status-overdue',
      },
    };

    const config = statusConfig[status];

    return (
      <span ref={ref} className={cn('status-badge', config.className, className)} {...props}>
        {config.label}
      </span>
    );
  }
);
MemberStatusBadge.displayName = 'MemberStatusBadge';
