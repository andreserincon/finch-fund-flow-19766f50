import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
