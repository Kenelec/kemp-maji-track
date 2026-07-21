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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_approval_requests: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          admin_user_id: string
          id: string
          payload: Json | null
          requested_action: string
          requested_at: string | null
          status: string | null
          target_id: string
          target_table: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          admin_user_id: string
          id?: string
          payload?: Json | null
          requested_action: string
          requested_at?: string | null
          status?: string | null
          target_id: string
          target_table: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          admin_user_id?: string
          id?: string
          payload?: Json | null
          requested_action?: string
          requested_at?: string | null
          status?: string | null
          target_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_approval_requests_acted_by_fkey"
            columns: ["acted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_approval_requests_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string | null
          diff: Json | null
          id: string
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          diff?: Json | null
          id?: string
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          diff?: Json | null
          id?: string
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          area: string | null
          created_at: string | null
          customer_name: string
          email: string | null
          id: string
          notification_preference: string | null
          pending_approval: boolean | null
          phone: string | null
          user_id: string | null
        }
        Insert: {
          address?: string | null
          area?: string | null
          created_at?: string | null
          customer_name: string
          email?: string | null
          id?: string
          notification_preference?: string | null
          pending_approval?: boolean | null
          phone?: string | null
          user_id?: string | null
        }
        Update: {
          address?: string | null
          area?: string | null
          created_at?: string | null
          customer_name?: string
          email?: string | null
          id?: string
          notification_preference?: string | null
          pending_approval?: boolean | null
          phone?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      customers_edits: {
        Row: {
          approver: string | null
          customer_id: string
          decided_at: string | null
          id: string
          proposed_changes: Json
          requested_at: string
          requested_by: string
          status: string
        }
        Insert: {
          approver?: string | null
          customer_id: string
          decided_at?: string | null
          id?: string
          proposed_changes: Json
          requested_at?: string
          requested_by: string
          status?: string
        }
        Update: {
          approver?: string | null
          customer_id?: string
          decided_at?: string | null
          id?: string
          proposed_changes?: Json
          requested_at?: string
          requested_by?: string
          status?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          auto_confirmed: boolean | null
          confirmation_deadline: string | null
          confirmation_reminder_sent: boolean | null
          confirmed_at: string | null
          created_at: string | null
          created_by_user: string
          customer_confirmed: boolean | null
          customer_id: string
          delivery_date: string
          delivery_note_no: string | null
          delivery_status: string | null
          discrepancy_flag: boolean | null
          discrepancy_notes: string | null
          discrepancy_resolved: boolean | null
          discrepancy_resolved_at: string | null
          discrepancy_resolved_by: string | null
          driver_id: string | null
          id: string
          last_reminder_sent_at: string | null
          mpesa_transaction_id: string | null
          payment_date: string | null
          payment_link_token: string | null
          payment_reminder_sent: boolean | null
          payment_status: string | null
          pending_approval: boolean | null
          qty: number
          total_amount: number
          unit_rate: number
        }
        Insert: {
          auto_confirmed?: boolean | null
          confirmation_deadline?: string | null
          confirmation_reminder_sent?: boolean | null
          confirmed_at?: string | null
          created_at?: string | null
          created_by_user: string
          customer_confirmed?: boolean | null
          customer_id: string
          delivery_date: string
          delivery_note_no?: string | null
          delivery_status?: string | null
          discrepancy_flag?: boolean | null
          discrepancy_notes?: string | null
          discrepancy_resolved?: boolean | null
          discrepancy_resolved_at?: string | null
          discrepancy_resolved_by?: string | null
          driver_id?: string | null
          id?: string
          last_reminder_sent_at?: string | null
          mpesa_transaction_id?: string | null
          payment_date?: string | null
          payment_link_token?: string | null
          payment_reminder_sent?: boolean | null
          payment_status?: string | null
          pending_approval?: boolean | null
          qty: number
          total_amount: number
          unit_rate: number
        }
        Update: {
          auto_confirmed?: boolean | null
          confirmation_deadline?: string | null
          confirmation_reminder_sent?: boolean | null
          confirmed_at?: string | null
          created_at?: string | null
          created_by_user?: string
          customer_confirmed?: boolean | null
          customer_id?: string
          delivery_date?: string
          delivery_note_no?: string | null
          delivery_status?: string | null
          discrepancy_flag?: boolean | null
          discrepancy_notes?: string | null
          discrepancy_resolved?: boolean | null
          discrepancy_resolved_at?: string | null
          discrepancy_resolved_by?: string | null
          driver_id?: string | null
          id?: string
          last_reminder_sent_at?: string | null
          mpesa_transaction_id?: string | null
          payment_date?: string | null
          payment_link_token?: string | null
          payment_reminder_sent?: boolean | null
          payment_status?: string | null
          pending_approval?: boolean | null
          qty?: number
          total_amount?: number
          unit_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_created_by_user_fkey"
            columns: ["created_by_user"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_acl: {
        Row: {
          created_at: string | null
          delivery_id: string
          id: string
          role: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          delivery_id: string
          id?: string
          role?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          delivery_id?: string
          id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_acl_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_acl_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_discrepancies: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          customer_id: string | null
          delivery_id: string | null
          id: string
          query_description: string
          query_type: string | null
          resolved_at: string | null
          status: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          customer_id?: string | null
          delivery_id?: string | null
          id?: string
          query_description: string
          query_type?: string | null
          resolved_at?: string | null
          status?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          customer_id?: string | null
          delivery_id?: string | null
          id?: string
          query_description?: string
          query_type?: string | null
          resolved_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_discrepancies_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_discrepancies_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_items: {
        Row: {
          customer_id: string | null
          delivery_id: string
          id: string
          product_id: string
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          customer_id?: string | null
          delivery_id: string
          id?: string
          product_id: string
          product_name: string
          quantity: number
          total_price: number
          unit_price: number
        }
        Update: {
          customer_id?: string | null
          delivery_id?: string
          id?: string
          product_id?: string
          product_name?: string
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_queries: {
        Row: {
          approval_request_id: string | null
          created_at: string | null
          customer_id: string
          delivery_id: string
          id: string
          message: string
          query_type: string
          requires_approval: boolean | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          approval_request_id?: string | null
          created_at?: string | null
          customer_id: string
          delivery_id: string
          id?: string
          message: string
          query_type: string
          requires_approval?: boolean | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          approval_request_id?: string | null
          created_at?: string | null
          customer_id?: string
          delivery_id?: string
          id?: string
          message?: string
          query_type?: string
          requires_approval?: boolean | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_queries_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "admin_approval_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_queries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_queries_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_queries_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          created_at: string | null
          driver_id: string
          id: string
          latitude: number
          longitude: number
          timestamp: number | null
        }
        Insert: {
          accuracy?: number | null
          created_at?: string | null
          driver_id: string
          id?: string
          latitude: number
          longitude: number
          timestamp?: number | null
        }
        Update: {
          accuracy?: number | null
          created_at?: string | null
          driver_id?: string
          id?: string
          latitude?: number
          longitude?: number
          timestamp?: number | null
        }
        Relationships: []
      }
      drivers: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          phone: string | null
          updated_at: string | null
          vehicle_number: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          phone?: string | null
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          phone?: string | null
          updated_at?: string | null
          vehicle_number?: string | null
        }
        Relationships: []
      }
      in_app_notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      mpesa_sms_inbox: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          matched_payment_id: string | null
          message_text: string | null
          mpesa_code: string
          received_at: string
          sender_name: string | null
          sender_phone: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          matched_payment_id?: string | null
          message_text?: string | null
          mpesa_code: string
          received_at?: string
          sender_name?: string | null
          sender_phone?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          matched_payment_id?: string | null
          message_text?: string | null
          mpesa_code?: string
          received_at?: string
          sender_name?: string | null
          sender_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mpesa_sms_inbox_matched_payment_id_fkey"
            columns: ["matched_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications_log: {
        Row: {
          channel: string
          content: string
          created_at: string | null
          id: string
          provider_ref: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          channel: string
          content: string
          created_at?: string | null
          id?: string
          provider_ref?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          content?: string
          created_at?: string | null
          id?: string
          provider_ref?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_approval_requests: {
        Row: {
          id: string
          note: string | null
          payment_id: string
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          id?: string
          note?: string | null
          payment_id: string
          requested_at?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          id?: string
          note?: string | null
          payment_id?: string
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_approval_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_approvals: {
        Row: {
          action: string
          approved_at: string
          approved_by: string
          id: string
          payment_id: string
        }
        Insert: {
          action: string
          approved_at?: string
          approved_by: string
          id?: string
          payment_id: string
        }
        Update: {
          action?: string
          approved_at?: string
          approved_by?: string
          id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_approvals_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          customer_id: string
          delivery_id: string | null
          due_date: string
          id: string
          mpesa_code: string | null
          payment_method: string | null
          pending_approval: boolean | null
          rejection_reason: string | null
          status: string | null
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          customer_id: string
          delivery_id?: string | null
          due_date: string
          id?: string
          mpesa_code?: string | null
          payment_method?: string | null
          pending_approval?: boolean | null
          rejection_reason?: string | null
          status?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          customer_id?: string
          delivery_id?: string | null
          due_date?: string
          id?: string
          mpesa_code?: string | null
          payment_method?: string | null
          pending_approval?: boolean | null
          rejection_reason?: string | null
          status?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
        ]
      }
      payments_audit: {
        Row: {
          id: string
          new_data: Json | null
          note: string | null
          old_data: Json | null
          operation: string
          payment_id: string
          performed_at: string
          performed_by: string | null
        }
        Insert: {
          id?: string
          new_data?: Json | null
          note?: string | null
          old_data?: Json | null
          operation: string
          payment_id: string
          performed_at?: string
          performed_by?: string | null
        }
        Update: {
          id?: string
          new_data?: Json | null
          note?: string | null
          old_data?: Json | null
          operation?: string
          payment_id?: string
          performed_at?: string
          performed_by?: string | null
        }
        Relationships: []
      }
      pending_changes: {
        Row: {
          approval_request_id: string | null
          created_at: string | null
          id: string
          pending_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          approval_request_id?: string | null
          created_at?: string | null
          id?: string
          pending_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          approval_request_id?: string | null
          created_at?: string | null
          id?: string
          pending_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_changes_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "admin_approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          created_at: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          name: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          id: string
          last_seen: string | null
          name: string
          phone: string | null
          role_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          last_seen?: string | null
          name: string
          phone?: string | null
          role_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_seen?: string | null
          name?: string
          phone?: string | null
          role_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "user_roles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_customer_edit: {
        Args: { approver_id: string; edit_id: string }
        Returns: undefined
      }
      generate_payment_token: { Args: never; Returns: string }
      get_auth_uid: { Args: never; Returns: string }
      get_current_customer_id: { Args: never; Returns: string }
      get_user_role: { Args: { user_uuid: string }; Returns: string }
      mark_overdue_payments: { Args: never; Returns: undefined }
      try_match_mpesa_payment: {
        Args: { p_payment_id: string }
        Returns: boolean
      }
      user_can_view_delivery:
        | { Args: { p_delivery_id: string }; Returns: boolean }
        | { Args: { p_delivery: string; p_user: string }; Returns: boolean }
    }
    Enums: {
      app_role: "MasterAdmin" | "Admin" | "Customer"
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
      app_role: ["MasterAdmin", "Admin", "Customer"],
    },
  },
} as const
