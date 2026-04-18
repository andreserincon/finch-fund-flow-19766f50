/**
 * @file budget-types.ts
 * @description TypeScript types and constants for the Budget module.
 *   Mirrors the `budget_scenarios`, `budget_scenario_parameters` and
 *   `budget_lines` tables introduced in Phase 1.
 */

import type {
  AccountType,
  TransactionType,
  TransactionCategory,
} from './types';

/* ================================================================== */
/*  Interfaces                                                        */
/* ================================================================== */

/** A named annual budget plan (original or revision). */
export interface BudgetScenario {
  id: string;
  year: number;
  scenario_name: string;
  is_active: boolean;
  /** Points at the source scenario when this row is a revision. */
  parent_scenario_id: string | null;
  /** 0 for originals; 1, 2, … for each revision. */
  revision_number: number;
  /** Month the revision was produced (e.g. 2 = Feb, 7 = Jul). */
  revision_month: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 1:1 parametric knobs attached to a scenario. */
export interface BudgetScenarioParameters {
  id: string;
  budget_scenario_id: string;
  /** Annual inflation assumption, percent (e.g. 135.00 = 135%). */
  inflation_percent: number;
  /** Expected growth in paying-membership count, percent. */
  membership_growth_percent: number;
  /** Multiplier applied to extraordinary-income projections (1.0 = off). */
  extraordinary_income_multiplier: number;
  created_at: string;
  updated_at: string;
}

/** A single cell of the budget matrix. */
export interface BudgetLine {
  id: string;
  budget_scenario_id: string;
  /** 1–12 (January = 1). */
  month: number;
  account: AccountType;
  transaction_type: TransactionType;
  category: TransactionCategory;
  budgeted_amount: number;
  created_at: string;
  updated_at: string;
}

/* ================================================================== */
/*  Helpers                                                           */
/* ================================================================== */

/**
 * Natural income vs. expense mapping for each transaction category.
 * A couple of categories (account_yield, reimbursement) can legitimately
 * appear as the opposite type; we default to the most common usage and
 * let the editor override per-line when needed.
 */
export const CATEGORY_DEFAULT_TYPE: Record<TransactionCategory, TransactionType> = {
  monthly_fee:              'income',
  extraordinary_income:     'income',
  donation:                 'income',
  reimbursement:            'income',
  other_income:             'income',
  event_payment:            'income',
  loan_repayment:           'income',
  account_yield:            'income',
  event_expense:            'expense',
  parent_organization_fee:  'expense',
  other_expense:            'expense',
  loan_disbursement:        'expense',
};

/** Months 1–12 as a static array for matrix rendering. */
export const BUDGET_MONTHS: ReadonlyArray<number> = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
] as const;

/** Spanish month labels (full), indexed 1–12. */
export const MONTH_LABELS_ES: Record<number, string> = {
  1:  'Enero',
  2:  'Febrero',
  3:  'Marzo',
  4:  'Abril',
  5:  'Mayo',
  6:  'Junio',
  7:  'Julio',
  8:  'Agosto',
  9:  'Septiembre',
  10: 'Octubre',
  11: 'Noviembre',
  12: 'Diciembre',
};

/** Short (3-letter) Spanish month labels for compact headers. */
export const MONTH_SHORT_LABELS_ES: Record<number, string> = {
  1: 'Ene', 2: 'Feb', 3: 'Mar',  4: 'Abr',
  5: 'May', 6: 'Jun', 7: 'Jul',  8: 'Ago',
  9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Dic',
};

/**
 * Key helper: encode a (month, account, type, category) tuple as a
 * stable string for use in React keys and client-side Maps.
 */
export function budgetLineKey(
  month: number,
  account: AccountType,
  transactionType: TransactionType,
  category: TransactionCategory,
): string {
  return `${month}:${account}:${transactionType}:${category}`;
}
