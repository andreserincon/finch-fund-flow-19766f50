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
          id: string
          updated_at: string
          year_month: string
        }
        Insert: {
          amount?: number
          created_at?: string
          fee_type: Database["public"]["Enums"]["fee_type"]
          id?: string
          updated_at?: string
          year_month: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee_type?: Database["public"]["Enums"]["fee_type"]
          id?: string
          updated_at?: string
          year_month?: string
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
      is_treasurer: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      account_type: "bank" | "great_lodge" | "savings"
      app_role: "treasurer" | "vm" | "member"
      fee_type: "standard" | "solidarity"
      loan_status: "active" | "paid" | "cancelled"
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
      transaction_type: "income" | "expense"
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
      app_role: ["treasurer", "vm", "member"],
      fee_type: ["standard", "solidarity"],
      loan_status: ["active", "paid", "cancelled"],
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
      ],
      transaction_type: ["income", "expense"],
    },
  },
} as const
