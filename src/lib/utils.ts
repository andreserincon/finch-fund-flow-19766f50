/**
 * @file utils.ts
 * @description Shared utility functions used across the application.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes, resolving conflicts automatically.
 * Combines clsx (conditional classes) with tailwind-merge (conflict resolution).
 *
 * @example cn("px-4", isActive && "bg-primary", "px-2") // → "px-2 bg-primary"
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a date-only string (e.g. "2025-01-15") as local time.
 * Without this, `new Date("2025-01-15")` interprets as UTC midnight,
 * which may appear as the previous day in negative-offset timezones.
 */
export function parseLocalDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'T00:00:00');
  }
  return new Date(dateStr);
}

/** Supported currencies for formatting */
export type Currency = 'ARS' | 'USD';

/** Format a number as a currency string (e.g. "$1.234,56" for ARS) */
export function formatCurrency(amount: number, currency: Currency = 'ARS'): string {
  return new Intl.NumberFormat(currency === 'ARS' ? 'es-AR' : 'en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

/** Format currency without decimals (compact display for dashboards) */
export function formatCurrencyCompact(amount: number, currency: Currency = 'ARS'): string {
  return new Intl.NumberFormat(currency === 'ARS' ? 'es-AR' : 'en-US', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Determine the display currency based on the account type */
export function getCurrencyForAccount(account: string): Currency {
  return account === 'savings' ? 'USD' : 'ARS';
}
