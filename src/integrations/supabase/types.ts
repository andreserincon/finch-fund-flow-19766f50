export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_transfers: {
        Row: {
          amount: number
          created_at: string
          from_account: Database["public"]["Enums"]["account_type"]
          id: string
          notes: string | null
          to_account: Database["public"]["Enums"]["account_type"]
          transfer_date: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          from_account: Database["public"]["Enums"]["account_type"]
          id?: string
          notes?: string | null
          to_account: Database["public"]["Enums"]["account_type"]
          transfer_date?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          from_account?: Database["public"]["Enums"]["account_type"]
          id?: string
          notes?: string | null
          to_account?: Database["public"]["Enums"]["account_type"]
          transfer_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      book_transfer_requests: {
        Row: {
          book_id: string
          created_at: string
          id: string
          new_holder_id: string
          notes: string | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["transfer_request_status"]
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          new_holder_id: string
          notes?: string | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["transfer_request_status"]
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          new_holder_id?: string
          notes?: string | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["transfer_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "book_transfer_requests_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_transfer_requests_new_holder_id_fkey"
            columns: ["new_holder_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "book_transfer_requests_new_holder_id_fkey"
            columns: ["new_holder_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author: string
          created_at: string
          current_holder_id: string | null
          description: string | null
          edition: string | null
          grade_level: Database["public"]["Enums"]["masonic_grade"]
          held_since: string | null
          id: string
          publication_date: string | null
          status: Database["public"]["Enums"]["book_status"]
          title: string
          updated_at: string
        }
        Insert: {
          author: string
          created_at?: string
          current_holder_id?: string | null
          description?: string | null
          edition?: string | null
          grade_level?: Database["public"]["Enums"]["masonic_grade"]
          held_since?: string | null
          id?: string
          publication_date?: string | null
          status?: Database["public"]["Enums"]["book_status"]
          title: string
          updated_at?: string
        }
        Update: {
          author?: string
          created_at?: string
          current_holder_id?: string | null
          description?: string | null
          edition?: string | null
          grade_level?: Database["public"]["Enums"]["masonic_grade"]
          held_since?: string | null
          id?: string
          publication_date?: string | null
          status?: Database["public"]["Enums"]["book_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "books_current_holder_id_fkey"
            columns: ["current_holder_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "books_current_holder_id_fkey"
            columns: ["current_holder_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      event_member_payments: {
        Row: {
          amount_owed: number
          amount_paid: number
          created_at: string
          event_id: string
          id: string
          member_id: string
          updated_at: string
        }
        Insert: {
          amount_owed: number
          amount_paid?: number
          created_at?: string
          event_id: string
          id?: string
          member_id: string
          updated_at?: string
        }
        Update: {
          amount_owed?: number
          amount_paid?: number
          created_at?: string
          event_id?: string
          id?: string
          member_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_member_payments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "extraordinary_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_member_payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "event_member_payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      extraordinary_expenses: {
        Row: {
          created_at: string
          default_amount: number
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_amount?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_amount?: number
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      loan_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          loan_id: string
          notes: string | null
          payment_date: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          loan_id: string
          notes?: string | null
          payment_date?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          loan_id?: string
          notes?: string | null
          payment_date?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          account: Database["public"]["Enums"]["account_type"]
          amount: number
          amount_paid: number
          created_at: string
          disbursement_transaction_id: string | null
          id: string
          loan_date: string
          member_id: string
          notes: string | null
          paid_date: string | null
          repayment_transaction_id: string | null
          status: Database["public"]["Enums"]["loan_status"]
          updated_at: string
        }
        Insert: {
          account: Database["public"]["Enums"]["account_type"]
          amount: number
          amount_paid?: number
          created_at?: string
          disbursement_transaction_id?: string | null
          id?: string
          loan_date?: string
          member_id: string
          notes?: string | null
          paid_date?: string | null
          repayment_transaction_id?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          updated_at?: string
        }
        Update: {
          account?: Database["public"]["Enums"]["account_type"]
          amount?: number
          amount_paid?: number
          created_at?: string
          disbursement_transaction_id?: string | null
          id?: string
          loan_date?: string
          member_id?: string
          notes?: string | null
          paid_date?: string | null
          repayment_transaction_id?: string | null
          status?: Database["public"]["Enums"]["loan_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_disbursement_transaction_id_fkey"
            columns: ["disbursement_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_repayment_transaction_id_fkey"
            columns: ["repayment_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      member_fee_type_history: {
        Row: {
          created_at: string
          effective_from: string
          fee_type: Database["public"]["Enums"]["fee_type"]
          id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          fee_type: Database["public"]["Enums"]["fee_type"]
          id?: string
          member_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          fee_type?: Database["public"]["Enums"]["fee_type"]
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_fee_type_history_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "member_fee_type_history_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          fee_type: Database["public"]["Enums"]["fee_type"]
          full_name: string
          id: string
          is_active: boolean
          join_date: string
          masonic_grade: Database["public"]["Enums"]["masonic_grade"]
          monthly_fee_amount: number
          phone_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee_type?: Database["public"]["Enums"]["fee_type"]
          full_name: string
          id?: string
          is_active?: boolean
          join_date?: string
          masonic_grade?: Database["public"]["Enums"]["masonic_grade"]
          monthly_fee_amount?: number
          phone_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee_type?: Database["public"]["Enums"]["fee_type"]
          full_name?: string
          id?: string
          is_active?: boolean
          join_date?: string
          masonic_grade?: Database["public"]["Enums"]["masonic_grade"]
          monthly_fee_amount?: number
          phone_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      monthly_fees: {
        Row: {
          amount: number
          created_at: string
          fee_type: Database["public"]["Enums"]["fee_type"]
          gl_solidarity_amount: number | null
          gl_standard_amount: number | null
          id: string
          updated_at: string
          year_month: string
        }
        Insert: {
          amount?: number
          created_at?: string
          fee_type: Database["public"]["Enums"]["fee_type"]
          gl_solidarity_amount?: number | null
          gl_standard_amount?: number | null
          id?: string
          updated_at?: string
          year_month: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee_type?: Database["public"]["Enums"]["fee_type"]
          gl_solidarity_amount?: number | null
          gl_standard_amount?: number | null
          id?: string
          updated_at?: string
          year_month?: string
        }
        Relationships: []
      }
      monthly_reports: {
        Row: {
          bank_balance: number
          collected_monthly_fees: number
          collection_percentage: number
          created_at: string
          expected_monthly_fees: number
          generated_at: string | null
          generated_by: string | null
          great_lodge_balance: number
          id: string
          lite_pdf_path: string | null
          members_late_payment: number
          members_missing_payment: number
          members_overdue: number
          net_result: number
          net_treasury_position: number
          outstanding_loans_ars: number
          outstanding_loans_usd: number
          outstanding_member_debt: number
          pdf_path: string | null
          prepaid_member_credit: number
          report_month: number
          report_year: number
          savings_balance: number
          status: Database["public"]["Enums"]["report_status"]
          total_inflows: number
          total_outflows: number
          updated_at: string
        }
        Insert: {
          bank_balance?: number
          collected_monthly_fees?: number
          collection_percentage?: number
          created_at?: string
          expected_monthly_fees?: number
          generated_at?: string | null
          generated_by?: string | null
          great_lodge_balance?: number
          id?: string
          lite_pdf_path?: string | null
          members_late_payment?: number
          members_missing_payment?: number
          members_overdue?: number
          net_result?: number
          net_treasury_position?: number
          outstanding_loans_ars?: number
          outstanding_loans_usd?: number
          outstanding_member_debt?: number
          pdf_path?: string | null
          prepaid_member_credit?: number
          report_month: number
          report_year: number
          savings_balance?: number
          status?: Database["public"]["Enums"]["report_status"]
          total_inflows?: number
          total_outflows?: number
          updated_at?: string
        }
        Update: {
          bank_balance?: number
          collected_monthly_fees?: number
          collection_percentage?: number
          created_at?: string
          expected_monthly_fees?: number
          generated_at?: string | null
          generated_by?: string | null
          great_lodge_balance?: number
          id?: string
          lite_pdf_path?: string | null
          members_late_payment?: number
          members_missing_payment?: number
          members_overdue?: number
          net_result?: number
          net_treasury_position?: number
          outstanding_loans_ars?: number
          outstanding_loans_usd?: number
          outstanding_member_debt?: number
          pdf_path?: string | null
          prepaid_member_credit?: number
          report_month?: number
          report_year?: number
          savings_balance?: number
          status?: Database["public"]["Enums"]["report_status"]
          total_inflows?: number
          total_outflows?: number
          updated_at?: string
        }
        Relationships: []
      }
      organization_settings: {
        Row: {
          description: string | null
          id: string
          setting_key: string
          setting_value: number
          updated_at: string
        }
        Insert: {
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: number
          updated_at?: string
        }
        Update: {
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          member_id: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          member_id?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          member_id?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "profiles_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      report_event_snapshots: {
        Row: {
          amount_collected: number
          created_at: string
          event_id: string
          event_name: string
          event_status: string
          id: string
          members_included: number
          members_unpaid: number
          outstanding_amount: number
          report_id: string
          total_amount: number
        }
        Insert: {
          amount_collected: number
          created_at?: string
          event_id: string
          event_name: string
          event_status: string
          id?: string
          members_included: number
          members_unpaid: number
          outstanding_amount: number
          report_id: string
          total_amount: number
        }
        Update: {
          amount_collected?: number
          created_at?: string
          event_id?: string
          event_name?: string
          event_status?: string
          id?: string
          members_included?: number
          members_unpaid?: number
          outstanding_amount?: number
          report_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_event_snapshots_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "monthly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_loan_snapshots: {
        Row: {
          account: Database["public"]["Enums"]["account_type"]
          amount_paid: number
          borrower_name: string
          created_at: string
          id: string
          loan_id: string
          original_amount: number
          outstanding_balance: number
          payment_status: string
          report_id: string
        }
        Insert: {
          account: Database["public"]["Enums"]["account_type"]
          amount_paid: number
          borrower_name: string
          created_at?: string
          id?: string
          loan_id: string
          original_amount: number
          outstanding_balance: number
          payment_status: string
          report_id: string
        }
        Update: {
          account?: Database["public"]["Enums"]["account_type"]
          amount_paid?: number
          borrower_name?: string
          created_at?: string
          id?: string
          loan_id?: string
          original_amount?: number
          outstanding_balance?: number
          payment_status?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_loan_snapshots_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "monthly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_member_snapshots: {
        Row: {
          balance_at_month_end: number
          created_at: string
          fee_type: Database["public"]["Enums"]["fee_type"]
          full_name: string
          id: string
          last_payment_date: string | null
          member_id: string
          monthly_fee_amount: number
          months_ahead: number | null
          months_overdue: number | null
          overdue_amount: number | null
          report_id: string
          status: string
        }
        Insert: {
          balance_at_month_end: number
          created_at?: string
          fee_type: Database["public"]["Enums"]["fee_type"]
          full_name: string
          id?: string
          last_payment_date?: string | null
          member_id: string
          monthly_fee_amount: number
          months_ahead?: number | null
          months_overdue?: number | null
          overdue_amount?: number | null
          report_id: string
          status: string
        }
        Update: {
          balance_at_month_end?: number
          created_at?: string
          fee_type?: Database["public"]["Enums"]["fee_type"]
          full_name?: string
          id?: string
          last_payment_date?: string | null
          member_id?: string
          monthly_fee_amount?: number
          months_ahead?: number | null
          months_overdue?: number | null
          overdue_amount?: number | null
          report_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_member_snapshots_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "monthly_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account: Database["public"]["Enums"]["account_type"]
          amount: number
          category: Database["public"]["Enums"]["transaction_category"]
          created_at: string
          id: string
          member_id: string | null
          notes: string | null
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
        }
        Insert: {
          account?: Database["public"]["Enums"]["account_type"]
          amount: number
          category: Database["public"]["Enums"]["transaction_category"]
          created_at?: string
          id?: string
          member_id?: string | null
          notes?: string | null
          transaction_date?: string
          transaction_type: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Update: {
          account?: Database["public"]["Enums"]["account_type"]
          amount?: number
          category?: Database["public"]["Enums"]["transaction_category"]
          created_at?: string
          id?: string
          member_id?: string | null
          notes?: string | null
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "member_balances"
            referencedColumns: ["member_id"]
          },
          {
            foreignKeyName: "transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      member_balances: {
        Row: {
          current_balance: number | null
          fee_type: Database["public"]["Enums"]["fee_type"] | null
          full_name: string | null
          is_active: boolean | null
          join_date: string | null
          member_id: string | null
          monthly_fee_amount: number | null
          months_since_join: number | null
          phone_number: string | null
          total_fees_owed: number | null
          total_paid: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_view: { Args: { _user_id: string }; Returns: boolean }
      get_member_fee_type_for_month: {
        Args: { p_member_id: string; p_month: string }
        Returns: Database["public"]["Enums"]["fee_type"]
      }
      get_user_masonic_grade: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["masonic_grade"]
      }
      get_user_member_id: { Args: { _user_id: string }; Returns: string }
      get_users_with_roles: {
        Args: never
        Returns: {
          email: string
          member_id: string
          role: Database["public"]["Enums"]["app_role"]
          role_assigned_at: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_bibliotecario: { Args: { _user_id: string }; Returns: boolean }
      is_treasurer: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      account_type: "bank" | "great_lodge" | "savings"
      app_role: "treasurer" | "vm" | "member" | "bibliotecario"
      book_status: "available" | "on_loan"
      fee_type: "standard" | "solidarity"
      loan_status: "active" | "paid" | "cancelled"
      masonic_grade: "aprendiz" | "companero" | "maestro"
      report_status: "generating" | "generated" | "failed"
      transaction_category:
        | "monthly_fee"
        | "extraordinary_income"
        | "donation"
        | "reimbursement"
        | "event_expense"
        | "parent_organization_fee"
        | "other_expense"
        | "other_income"
        | "event_payment"
        | "loan_disbursement"
        | "loan_repayment"
        | "account_yield"
      transaction_type: "income" | "expense"
      transfer_request_status: "pending" | "approved" | "rejected"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["bank", "great_lodge", "savings"],
      app_role: ["treasurer", "vm", "member", "bibliotecario"],
      book_status: ["available", "on_loan"],
      fee_type: ["standard", "solidarity"],
      loan_status: ["active", "paid", "cancelled"],
      masonic_grade: ["aprendiz", "companero", "maestro"],
      report_status: ["generating", "generated", "failed"],
      transaction_category: [
        "monthly_fee",
        "extraordinary_income",
        "donation",
        "reimbursement",
        "event_expense",
        "parent_organization_fee",
        "other_expense",
        "other_income",
        "event_payment",
        "loan_disbursement",
        "loan_repayment",
        "account_yield",
      ],
      transaction_type: ["income", "expense"],
      transfer_request_status: ["pending", "approved", "rejected"],
    },
  },
} as const
