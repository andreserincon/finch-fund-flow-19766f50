import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PaymentStatus } from '@/lib/types';

interface MemberStatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** One of the four canonical member states. */
  status: PaymentStatus;
}

/**
 * Shared status pill. Renders the Spanish label (from i18n status.* keys) and
 * the canonical color token for one of the four capita states. This is the
 * single source for status colors/labels across the app, so callers derive a
 * PaymentStatus (see getMemberCapitaStatus) and hand it here.
 */
const STATUS_CLASS: Record<PaymentStatus, string> = {
  al_dia: 'status-al-dia',
  adelantado: 'status-adelantado',
  impago: 'status-impago',
  demorado: 'status-demorado',
};

const STATUS_I18N: Record<PaymentStatus, string> = {
  al_dia: 'status.alDia',
  adelantado: 'status.adelantado',
  impago: 'status.impago',
  demorado: 'status.demorado',
};

export const MemberStatusBadge = React.forwardRef<HTMLSpanElement, MemberStatusBadgeProps>(
  ({ status, className, ...props }, ref) => {
    const { t } = useTranslation();
    return (
      <span ref={ref} className={cn('status-badge', STATUS_CLASS[status], className)} {...props}>
        {t(STATUS_I18N[status])}
      </span>
    );
  }
);
MemberStatusBadge.displayName = 'MemberStatusBadge';
