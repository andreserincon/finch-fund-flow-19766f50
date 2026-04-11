/**
 * @file types.ts
 * @description Shared TypeScript type definitions and constants
 *   used across the treasury management module.
 */

/* ================================================================== */
/*  Enums / union types                                               */
/* ================================================================== */

/** Member fee category */
export type FeeType = 'standard' | 'solidarity';

/** Transaction direction */
export type TransactionType = 'income' | 'expense';

/** Financial account the transaction belongs to */
export type AccountType = 'bank' | 'great_lodge' | 'savings';

/** Current state of a loan */
export type LoanStatus = 'active' | 'paid' | 'cancelled';

/** Category tag for a transaction (used for reporting) */
export type TransactionCategory =
  | 'monthly_fee'
  | 'extraordinary_income'
  | 'donation'
  | 'reimbursement'
  | 'event_expense'
  | 'parent_organization_fee'
  | 'other_expense'
  | 'other_income'
  | 'event_payment'
  | 'loan_disbursement'
  | 'loan_repayment'
  | 'account_yield';

/** Derived payment status for dashboard badges */
export type PaymentStatus = 'up_to_date' | 'ahead' | 'overdue';

/** Masonic degree level */
export type MasonicGrade = 'profano' | 'aprendiz' | 'companero' | 'maestro';

/* ================================================================== */
/*  Interfaces                                                        */
/* ================================================================== */

/** A lodge member */
export interface Member {
  id: string;
  full_name: string;
  phone_number: string;
  monthly_fee_amount: number;
  fee_type: FeeType;
  masonic_grade: MasonicGrade;
  is_active: boolean;
  join_date: string;
  created_at: string;
  updated_at: string;
}

/** A financial transaction (income or expense) */
export interface Transaction {
  id: string;
  transaction_date: string;
  amount: number;
  transaction_type: TransactionType;
  category: TransactionCategory;
  member_id: string | null;
  notes: string | null;
  account: AccountType;
  created_at: string;
  updated_at: string;
  /** Joined member data (optional, populated by queries) */
  member?: Member;
}

/** A transfer between internal accounts */
export interface AccountTransfer {
  id: string;
  transfer_date: string;
  amount: number;
  from_account: AccountType;
  to_account: AccountType;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** A loan issued to a member */
export interface Loan {
  id: string;
  member_id: string;
  amount: number;
  amount_paid: number;
  account: AccountType;
  status: LoanStatus;
  loan_date: string;
  paid_date: string | null;
  notes: string | null;
  disbursement_transaction_id: string | null;
  repayment_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  /** Joined member data (optional) */
  member?: Member;
}

/** Computed view showing a member's payment balance */
export interface MemberBalance {
  member_id: string;
  full_name: string;
  phone_number: string;
  monthly_fee_amount: number;
  fee_type: FeeType;
  is_active: boolean;
  join_date: string;
  current_balance: number;
  months_since_join: number;
  total_fees_owed: number;
  total_paid: number;
}

/** Global organisation settings (key-value numbers) */
export interface OrganizationSetting {
  id: string;
  setting_key: string;
  setting_value: number;
  description: string | null;
  updated_at: string;
}

/** User profile row from the `profiles` table */
export interface Profile {
  id: string;
  role: 'treasurer' | 'member';
  member_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Aggregated stats shown on the dashboard */
export interface DashboardStats {
  totalBalance: number;
  bankBalance: number;
  parentOrganizationBalance: number;
  membersOverdue: number;
  membersUpToDate: number;
  totalMembers: number;
  monthlyIncome: number;
  monthlyExpenses: number;
}

/* ================================================================== */
/*  Label maps (used in UI dropdowns and tables)                      */
/* ================================================================== */

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  monthly_fee: 'Cuota Mensual',
  extraordinary_income: 'Ingreso Extraordinario',
  donation: 'Donación',
  reimbursement: 'Reembolso',
  event_expense: 'Gasto de Evento',
  parent_organization_fee: 'Cuota Organización Matriz',
  other_expense: 'Otro Gasto',
  other_income: 'Otro Ingreso',
  event_payment: 'Pago de Evento',
  loan_disbursement: 'Desembolso de Préstamo',
  loan_repayment: 'Pago de Préstamo',
  account_yield: 'Rendimiento de Cuenta',
};

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  standard: 'Estándar',
  solidarity: 'Solidaria',
};

export const ACCOUNT_LABELS: Record<AccountType, string> = {
  bank: 'Cuenta Bancaria Principal',
  great_lodge: 'Cuenta GL',
  savings: 'Cuenta de Ahorros (USD)',
};

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  active: 'Activo',
  paid: 'Pagado',
  cancelled: 'Cancelado',
};
