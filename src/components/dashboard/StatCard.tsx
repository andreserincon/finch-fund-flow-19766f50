import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

export function StatCard({ 
  title, 
  value, 
  subtitle, 
  icon,
  variant = 'default',
  className 
}: StatCardProps) {
  const variantStyles = {
    default: '',
    success: 'border-success/20 bg-success/5',
    warning: 'border-warning/20 bg-warning/5',
    danger: 'border-overdue/20 bg-overdue/5',
  };

  const valueStyles = {
    default: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-overdue',
  };

  return (
    <div className={cn('stat-card', variantStyles[variant], className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="stat-label text-xs md:text-sm">{title}</p>
          <p className={cn('stat-value mt-1 text-lg md:text-2xl truncate', valueStyles[variant])}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs md:text-sm text-muted-foreground mt-1 break-words whitespace-pre-line">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="flex-shrink-0 ml-2 md:ml-4 hidden sm:block">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
