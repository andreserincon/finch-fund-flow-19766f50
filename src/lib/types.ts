export type FeeType = 'standard' | 'solidarity';
export type TransactionType = 'income' | 'expense';
export type AccountType = 'bank' | 'great_lodge' | 'savings';
export type LoanStatus = 'active' | 'paid' | 'cancelled';
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

export type PaymentStatus = 'up_to_date' | 'ahead' | 'overdue';

export interface Member {
  id: string;
  full_name: string;
  phone_number: string;
  monthly_fee_amount: number;
  fee_type: FeeType;
  is_active: boolean;
  join_date: string;
  created_at: string;
  updated_at: string;
}

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
  member?: Member;
}

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
  member?: Member;
}

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

export interface OrganizationSetting {
  id: string;
  setting_key: string;
  setting_value: number;
  description: string | null;
  updated_at: string;
}

export interface Profile {
  id: string;
  role: 'treasurer' | 'member';
  member_id: string | null;
  created_at: string;
  updated_at: string;
}

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

export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  monthly_fee: 'Monthly Fee',
  extraordinary_income: 'Extraordinary Income',
  donation: 'Donation',
  reimbursement: 'Reimbursement',
  event_expense: 'Event Expense',
  parent_organization_fee: 'Parent Organization Fee',
  other_expense: 'Other Expense',
  other_income: 'Other Income',
  event_payment: 'Event Payment',
  loan_disbursement: 'Loan Disbursement',
  loan_repayment: 'Loan Repayment',
  account_yield: 'Rendimiento de Cuenta',
};

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  standard: 'Standard',
  solidarity: 'Solidarity',
};

export const ACCOUNT_LABELS: Record<AccountType, string> = {
  bank: 'Bank Main Account',
  great_lodge: 'Great Lodge Account',
  savings: 'Savings Account (USD)',
};

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  active: 'Active',
  paid: 'Paid',
  cancelled: 'Cancelled',
};
