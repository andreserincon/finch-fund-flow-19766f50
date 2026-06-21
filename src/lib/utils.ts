/**
 * @file utils.ts
 * @description Shared utility functions used across the application.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { isWeekend } from "date-fns";

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

/**
 * Return the date of the Nth business day of a given month (1 = January).
 * Saturdays and Sundays are skipped. Argentine public holidays are NOT
 * skipped; that is a deliberate v1 choice; add a holiday calendar later
 * if needed.
 *
 * @example getNthBusinessDayOfMonth(2026, 5, 3) // → Wed 2026-05-06
 */
export function getNthBusinessDayOfMonth(year: number, month: number, n: number): Date {
  if (n < 1) throw new Error('n must be at least 1');
  let day = 1;
  let business = 0;
  while (true) {
    const d = new Date(year, month - 1, day);
    if (d.getMonth() !== month - 1) {
      throw new Error(`Month ${year}-${month} does not have ${n} business days`);
    }
    if (!isWeekend(d)) {
      business++;
      if (business === n) return d;
    }
    day++;
  }
}

/**
 * True if the given date is exactly the Nth business day of its month.
 * Used by scheduled edge functions to self-gate ("only run today if
 * today is the 3rd business day").
 */
export function isNthBusinessDayOfMonth(date: Date, n: number): boolean {
  const target = getNthBusinessDayOfMonth(date.getFullYear(), date.getMonth() + 1, n);
  return (
    target.getFullYear() === date.getFullYear() &&
    target.getMonth() === date.getMonth() &&
    target.getDate() === date.getDate()
  );
}
