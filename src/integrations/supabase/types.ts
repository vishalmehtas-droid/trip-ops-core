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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_values: Json | null
          old_values: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      destinations: {
        Row: {
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_to: string
          client_id: string
          created_at: string
          created_by: string
          enquiry_date: string
          id: string
          lead_number: string
          notes: string | null
          source: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          assigned_to: string
          client_id: string
          created_at?: string
          created_by?: string
          enquiry_date?: string
          id?: string
          lead_number: string
          notes?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string
          client_id?: string
          created_at?: string
          created_by?: string
          enquiry_date?: string
          id?: string
          lead_number?: string
          notes?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string
          key: string
          module: string
        }
        Insert: {
          created_at?: string
          description?: string
          key: string
          module: string
        }
        Update: {
          created_at?: string
          description?: string
          key?: string
          module?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      sale_costs: {
        Row: {
          base_currency_cost: number
          cost_type: Database["public"]["Enums"]["sale_cost_type"]
          created_at: string
          currency_code: string
          description: string
          exchange_rate: number
          id: string
          notes: string | null
          quantity: number
          sale_id: string
          sort_order: number
          total_cost: number
          unit_cost: number
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          base_currency_cost?: number
          cost_type: Database["public"]["Enums"]["sale_cost_type"]
          created_at?: string
          currency_code?: string
          description: string
          exchange_rate?: number
          id?: string
          notes?: string | null
          quantity?: number
          sale_id: string
          sort_order?: number
          total_cost?: number
          unit_cost: number
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          base_currency_cost?: number
          cost_type?: Database["public"]["Enums"]["sale_cost_type"]
          created_at?: string
          currency_code?: string
          description?: string
          exchange_rate?: number
          id?: string
          notes?: string | null
          quantity?: number
          sale_id?: string
          sort_order?: number
          total_cost?: number
          unit_cost?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_costs_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_costs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_pricing: {
        Row: {
          created_at: string
          customer_payable: number
          discount_amount: number
          expected_cost: number
          expected_gross_profit: number
          gst_amount: number
          gst_rate: number
          id: string
          markup_amount: number
          markup_type: Database["public"]["Enums"]["markup_type"]
          markup_value: number
          sale_id: string
          selling_value: number
          service_charge_amount: number
          tcs_amount: number
          tcs_applicable: boolean
          tcs_rate: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_payable?: number
          discount_amount?: number
          expected_cost?: number
          expected_gross_profit?: number
          gst_amount?: number
          gst_rate?: number
          id?: string
          markup_amount?: number
          markup_type?: Database["public"]["Enums"]["markup_type"]
          markup_value?: number
          sale_id: string
          selling_value?: number
          service_charge_amount?: number
          tcs_amount?: number
          tcs_applicable?: boolean
          tcs_rate?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_payable?: number
          discount_amount?: number
          expected_cost?: number
          expected_gross_profit?: number
          gst_amount?: number
          gst_rate?: number
          id?: string
          markup_amount?: number
          markup_type?: Database["public"]["Enums"]["markup_type"]
          markup_value?: number
          sale_id?: string
          selling_value?: number
          service_charge_amount?: number
          tcs_amount?: number
          tcs_applicable?: boolean
          tcs_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_pricing_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: true
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          billing_type: Database["public"]["Enums"]["billing_type"]
          booking_date: string
          client_id: string
          created_at: string
          created_by: string
          destination_id: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["sale_status"]
          travel_date: string | null
          updated_at: string
        }
        Insert: {
          billing_type?: Database["public"]["Enums"]["billing_type"]
          booking_date?: string
          client_id: string
          created_at?: string
          created_by?: string
          destination_id?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          travel_date?: string | null
          updated_at?: string
        }
        Update: {
          billing_type?: Database["public"]["Enums"]["billing_type"]
          booking_date?: string
          client_id?: string
          created_at?: string
          created_by?: string
          destination_id?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["sale_status"]
          travel_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_items: {
        Row: {
          created_at: string
          description: string
          id: string
          item_type: Database["public"]["Enums"]["sale_item_type"]
          quantity: number
          sale_id: string
          sort_order: number
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          item_type: Database["public"]["Enums"]["sale_item_type"]
          quantity?: number
          sale_id: string
          sort_order?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          item_type?: Database["public"]["Enums"]["sale_item_type"]
          quantity?: number
          sale_id?: string
          sort_order?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_quote_lines: {
        Row: {
          amount_inr: number
          created_at: string
          currency: string
          description: string
          exchange_rate: number
          id: string
          is_package: boolean
          purchase_type: Database["public"]["Enums"]["sale_item_type"]
          quantity: number
          sort_order: number
          supplier_quote_id: string
          unit_amount: number
          updated_at: string
        }
        Insert: {
          amount_inr?: number
          created_at?: string
          currency?: string
          description: string
          exchange_rate?: number
          id?: string
          is_package?: boolean
          purchase_type: Database["public"]["Enums"]["sale_item_type"]
          quantity?: number
          sort_order?: number
          supplier_quote_id: string
          unit_amount: number
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          created_at?: string
          currency?: string
          description?: string
          exchange_rate?: number
          id?: string
          is_package?: boolean
          purchase_type?: Database["public"]["Enums"]["sale_item_type"]
          quantity?: number
          sort_order?: number
          supplier_quote_id?: string
          unit_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quote_lines_supplier_quote_id_fkey"
            columns: ["supplier_quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_quotes: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_superseded: boolean
          lead_id: string
          notes: string | null
          previous_quote_id: string | null
          quote_number: string
          requirement_id: string
          revision_number: number
          status: Database["public"]["Enums"]["supplier_quote_status"]
          updated_at: string
          valid_until: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_superseded?: boolean
          lead_id: string
          notes?: string | null
          previous_quote_id?: string | null
          quote_number: string
          requirement_id: string
          revision_number?: number
          status?: Database["public"]["Enums"]["supplier_quote_status"]
          updated_at?: string
          valid_until?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_superseded?: boolean
          lead_id?: string
          notes?: string | null
          previous_quote_id?: string | null
          quote_number?: string
          requirement_id?: string
          revision_number?: number
          status?: Database["public"]["Enums"]["supplier_quote_status"]
          updated_at?: string
          valid_until?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_previous_quote_id_fkey"
            columns: ["previous_quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "travel_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quotes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_requirement_destinations: {
        Row: {
          created_at: string
          destination_id: string
          id: string
          nights: number | null
          requirement_id: string
          sequence_order: number
        }
        Insert: {
          created_at?: string
          destination_id: string
          id?: string
          nights?: number | null
          requirement_id: string
          sequence_order?: number
        }
        Update: {
          created_at?: string
          destination_id?: string
          id?: string
          nights?: number | null
          requirement_id?: string
          sequence_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "travel_requirement_destinations_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_requirement_destinations_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "travel_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_requirements: {
        Row: {
          adults: number
          budget: number | null
          children: number
          created_at: string
          created_by: string
          id: string
          lead_id: string
          notes: string | null
          requirement_number: string
          rooms: number | null
          status: Database["public"]["Enums"]["requirement_status"]
          travel_end_date: string | null
          travel_start_date: string | null
          trip_type: string | null
          updated_at: string
        }
        Insert: {
          adults?: number
          budget?: number | null
          children?: number
          created_at?: string
          created_by?: string
          id?: string
          lead_id: string
          notes?: string | null
          requirement_number: string
          rooms?: number | null
          status?: Database["public"]["Enums"]["requirement_status"]
          travel_end_date?: string | null
          travel_start_date?: string | null
          trip_type?: string | null
          updated_at?: string
        }
        Update: {
          adults?: number
          budget?: number | null
          children?: number
          created_at?: string
          created_by?: string
          id?: string
          lead_id?: string
          notes?: string | null
          requirement_number?: string
          rooms?: number | null
          status?: Database["public"]["Enums"]["requirement_status"]
          travel_end_date?: string | null
          travel_start_date?: string | null
          trip_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_requirements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_requirements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_requirements_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      vendors: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      user_directory: {
        Row: {
          id: string | null
          name: string | null
        }
        Insert: {
          id?: string | null
          name?: string | null
        }
        Update: {
          id?: string | null
          name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_supplier_quote_revision: {
        Args: { _quote_id: string }
        Returns: string
      }
      ensure_own_profile: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "sales" | "operations" | "accounts" | "viewer"
      billing_type: "tour_package" | "standalone_service"
      lead_status:
        | "new"
        | "in_progress"
        | "quoted"
        | "negotiation"
        | "won"
        | "lost"
      markup_type: "percentage" | "lumpsum" | "none"
      requirement_status: "draft" | "active" | "superseded" | "closed"
      sale_cost_type:
        | "hotel"
        | "flight"
        | "visa"
        | "activity"
        | "transport"
        | "tour_package"
        | "other"
      sale_item_type:
        | "hotel"
        | "flight"
        | "visa"
        | "activity"
        | "transport"
        | "other"
      sale_status: "pending" | "confirmed" | "completed" | "cancelled"
      supplier_quote_status: "requested" | "received" | "selected" | "rejected"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "sales", "operations", "accounts", "viewer"],
      billing_type: ["tour_package", "standalone_service"],
      lead_status: [
        "new",
        "in_progress",
        "quoted",
        "negotiation",
        "won",
        "lost",
      ],
      markup_type: ["percentage", "lumpsum", "none"],
      requirement_status: ["draft", "active", "superseded", "closed"],
      sale_cost_type: [
        "hotel",
        "flight",
        "visa",
        "activity",
        "transport",
        "tour_package",
        "other",
      ],
      sale_item_type: [
        "hotel",
        "flight",
        "visa",
        "activity",
        "transport",
        "other",
      ],
      sale_status: ["pending", "confirmed", "completed", "cancelled"],
      supplier_quote_status: ["requested", "received", "selected", "rejected"],
    },
  },
} as const
