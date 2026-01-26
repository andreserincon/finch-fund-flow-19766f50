import { cn } from '@/lib/utils';
import { PaymentStatus } from '@/lib/types';

interface MemberStatusBadgeProps {
  balance: number;
  totalOwed: number;
}

export function MemberStatusBadge({ balance, totalOwed }: MemberStatusBadgeProps) {
  const getStatus = (): PaymentStatus => {
    if (balance >= totalOwed) return 'ahead';
    if (balance >= totalOwed - 0.01) return 'up_to_date';
    return 'overdue';
  };

  const status = getStatus();
  const monthsDiff = totalOwed > 0 ? Math.round((balance - totalOwed) / (totalOwed / Math.max(1, 1))) : 0;

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
    <span className={cn('status-badge', config.className)}>
      {config.label}
    </span>
  );
}
