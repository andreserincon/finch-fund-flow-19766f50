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

/** Status of an outgoing payment reminder */
export type ReminderStatus =
  | 'pending_review'
  | 'sent'
  | 'failed'
  | 'dismissed';

/* ================================================================== */
/*  Interfaces                                                        */
/* ================================================================== */

/** A lodge member */
export interface Member {
  id: string;
  full_name: string;
  /**
   * Stores the member's lodge enrollment number (Matrícula). Despite the
   * column name this is NOT a phone number — see whatsapp_number for that.
   */
  phone_number: string;
  /** Real WhatsApp contact number in E.164 format (+5491155551234) */
  whatsapp_number: string | null;
  /** When true, the member opts out of automated WhatsApp reminders */
  whatsapp_opt_out: boolean;
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
  /**
   * When category is event_expense or event_payment, links to the
   * specific event in extraordinary_expenses.
   */
  event_id: string | null;
  /**
   * When category is event_payment, links to the specific participant
   * (member or guest) in event_member_payments. The participant's
   * amount_paid is kept in sync with the sum of transactions referencing
   * this id (see useTransactions).
   */
  event_member_payment_id: string | null;
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
  whatsapp_number: string | null;
  whatsapp_opt_out: boolean;
  monthly_fee_amount: number;
  fee_type: FeeType;
  is_active: boolean;
  join_date: string;
  current_balance: number;
  months_since_join: number;
  total_fees_owed: number;
  total_paid: number;
}

/**
 * Row in the `event_member_payments` table. Either member_id is set
 * (regular member participation) or guest_name is set (non-member
 * invitee), never both. Validated by a CHECK constraint in SQL.
 */
export interface EventMemberPayment {
  id: string;
  event_id: string;
  member_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  amount_owed: number;
  amount_paid: number;
  created_at: string;
  updated_at: string;
  /** Joined member data when member_id is non-null */
  member?: { id: string; full_name: string } | null;
}

/**
 * Row in the `payment_reminders` table — queue of outgoing WhatsApp
 * overdue reminders that the treasurer reviews and dispatches manually.
 */
export interface PaymentReminder {
  id: string;
  member_id: string;
  period_year: number;
  period_month: number;
  amount_owed: number;
  whatsapp_number: string | null;
  draft_message: string;
  final_message: string | null;
  status: ReminderStatus;
  twilio_message_sid: string | null;
  failure_reason: string | null;
  sent_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  /** Joined member data populated by the hook */
  member?: { id: string; full_name: string } | null;
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

export const REMINDER_STATUS_LABELS: Record<ReminderStatus, string> = {
  pending_review: 'Pendiente de revisión',
  sent: 'Enviado',
  failed: 'Falló',
  dismissed: 'Descartado',
};
