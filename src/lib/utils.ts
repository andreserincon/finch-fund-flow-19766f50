import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a date-only string (e.g. '2025-01-15') as local time instead of UTC.
 * This prevents timezone shifts where dates appear as the previous day.
 */
export function parseLocalDate(dateStr: string): Date {
  // If it's a date-only string (YYYY-MM-DD), append T00:00:00 to force local interpretation
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
}

export type Currency = 'ARS' | 'USD';

export function formatCurrency(amount: number, currency: Currency = 'ARS'): string {
  return new Intl.NumberFormat(currency === 'ARS' ? 'es-AR' : 'en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

export function formatCurrencyCompact(amount: number, currency: Currency = 'ARS'): string {
  return new Intl.NumberFormat(currency === 'ARS' ? 'es-AR' : 'en-US', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getCurrencyForAccount(account: string): Currency {
  return account === 'savings' ? 'USD' : 'ARS';
}
