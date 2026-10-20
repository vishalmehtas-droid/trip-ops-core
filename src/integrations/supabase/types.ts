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
      app_settings: {
        Row: {
          created_at: string
          default_markup_percent: number
          id: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_markup_percent?: number
          id?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_markup_percent?: number
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
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
          markup_percent_override: number | null
          name: string
          notes: string | null
          phone: string | null
          referred_by: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          markup_percent_override?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          referred_by?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          markup_percent_override?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          referred_by?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_quote_lines: {
        Row: {
          created_at: string
          currency: string
          customer_quote_id: string
          description: string
          expected_cost_inr: number
          id: string
          purchase_type: Database["public"]["Enums"]["sale_item_type"]
          quantity: number
          sort_order: number
          source_supplier_quote_line_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_quote_id: string
          description: string
          expected_cost_inr?: number
          id?: string
          purchase_type: Database["public"]["Enums"]["sale_item_type"]
          quantity?: number
          sort_order?: number
          source_supplier_quote_line_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_quote_id?: string
          description?: string
          expected_cost_inr?: number
          id?: string
          purchase_type?: Database["public"]["Enums"]["sale_item_type"]
          quantity?: number
          sort_order?: number
          source_supplier_quote_line_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_quote_lines_customer_quote_id_fkey"
            columns: ["customer_quote_id"]
            isOneToOne: false
            referencedRelation: "customer_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_quote_lines_source_supplier_quote_line_id_fkey"
            columns: ["source_supplier_quote_line_id"]
            isOneToOne: false
            referencedRelation: "supplier_quote_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_quote_pricing: {
        Row: {
          billing_type: Database["public"]["Enums"]["billing_type"]
          created_at: string
          customer_payable: number
          customer_quote_id: string
          discount_amount: number
          expected_cost: number
          expected_gross_profit: number
          gst_amount: number
          gst_rate: number
          id: string
          markup_amount: number
          markup_type: Database["public"]["Enums"]["markup_type"]
          markup_value: number
          selling_value: number
          service_charge_amount: number
          tcs_amount: number
          tcs_applicable: boolean
          tcs_rate: number | null
          updated_at: string
        }
        Insert: {
          billing_type?: Database["public"]["Enums"]["billing_type"]
          created_at?: string
          customer_payable?: number
          customer_quote_id: string
          discount_amount?: number
          expected_cost?: number
          expected_gross_profit?: number
          gst_amount?: number
          gst_rate?: number
          id?: string
          markup_amount?: number
          markup_type?: Database["public"]["Enums"]["markup_type"]
          markup_value?: number
          selling_value?: number
          service_charge_amount?: number
          tcs_amount?: number
          tcs_applicable?: boolean
          tcs_rate?: number | null
          updated_at?: string
        }
        Update: {
          billing_type?: Database["public"]["Enums"]["billing_type"]
          created_at?: string
          customer_payable?: number
          customer_quote_id?: string
          discount_amount?: number
          expected_cost?: number
          expected_gross_profit?: number
          gst_amount?: number
          gst_rate?: number
          id?: string
          markup_amount?: number
          markup_type?: Database["public"]["Enums"]["markup_type"]
          markup_value?: number
          selling_value?: number
          service_charge_amount?: number
          tcs_amount?: number
          tcs_applicable?: boolean
          tcs_rate?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_quote_pricing_customer_quote_id_fkey"
            columns: ["customer_quote_id"]
            isOneToOne: true
            referencedRelation: "customer_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_quotes: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          exclusions: string | null
          id: string
          inclusions: string | null
          itinerary: string | null
          last_viewed_at: string | null
          lead_id: string
          notes: string | null
          previous_quote_id: string | null
          public_title: string | null
          quote_number: string
          requirement_id: string
          revision_no: number
          share_enabled: boolean
          share_token: string
          status: Database["public"]["Enums"]["customer_quote_status"]
          summary: string | null
          terms: string | null
          updated_at: string
          valid_until: string | null
          view_count: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          exclusions?: string | null
          id?: string
          inclusions?: string | null
          itinerary?: string | null
          last_viewed_at?: string | null
          lead_id: string
          notes?: string | null
          previous_quote_id?: string | null
          public_title?: string | null
          quote_number: string
          requirement_id: string
          revision_no?: number
          share_enabled?: boolean
          share_token?: string
          status?: Database["public"]["Enums"]["customer_quote_status"]
          summary?: string | null
          terms?: string | null
          updated_at?: string
          valid_until?: string | null
          view_count?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          exclusions?: string | null
          id?: string
          inclusions?: string | null
          itinerary?: string | null
          last_viewed_at?: string | null
          lead_id?: string
          notes?: string | null
          previous_quote_id?: string | null
          public_title?: string | null
          quote_number?: string
          requirement_id?: string
          revision_no?: number
          share_enabled?: boolean
          share_token?: string
          status?: Database["public"]["Enums"]["customer_quote_status"]
          summary?: string | null
          terms?: string | null
          updated_at?: string
          valid_until?: string | null
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_quotes_previous_quote_id_fkey"
            columns: ["previous_quote_id"]
            isOneToOne: false
            referencedRelation: "customer_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_quotes_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "travel_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_receipts: {
        Row: {
          amount_inr: number
          cancel_reason: string | null
          created_at: string
          created_by: string
          id: string
          method: string
          notes: string | null
          payment_type: string
          receipt_date: string
          receipt_number: string
          reference: string | null
          sale_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_inr: number
          cancel_reason?: string | null
          created_at?: string
          created_by?: string
          id?: string
          method: string
          notes?: string | null
          payment_type?: string
          receipt_date?: string
          receipt_number?: string
          reference?: string | null
          sale_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          cancel_reason?: string | null
          created_at?: string
          created_by?: string
          id?: string
          method?: string
          notes?: string | null
          payment_type?: string
          receipt_date?: string
          receipt_number?: string
          reference?: string | null
          sale_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_receipts_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
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
          follow_up_date: string | null
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
          follow_up_date?: string | null
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
          follow_up_date?: string | null
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
      purchases: {
        Row: {
          amount: number
          amount_inr: number
          cancel_reason: string | null
          created_at: string
          created_by: string
          currency_code: string
          exchange_rate: number
          id: string
          invoice_date: string
          notes: string | null
          purchase_number: string
          sale_id: string
          status: string
          updated_at: string
          vendor_id: string
          vendor_invoice_number: string | null
        }
        Insert: {
          amount: number
          amount_inr?: number
          cancel_reason?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string
          exchange_rate?: number
          id?: string
          invoice_date?: string
          notes?: string | null
          purchase_number?: string
          sale_id: string
          status?: string
          updated_at?: string
          vendor_id: string
          vendor_invoice_number?: string | null
        }
        Update: {
          amount?: number
          amount_inr?: number
          cancel_reason?: string | null
          created_at?: string
          created_by?: string
          currency_code?: string
          exchange_rate?: number
          id?: string
          invoice_date?: string
          notes?: string | null
          purchase_number?: string
          sale_id?: string
          status?: string
          updated_at?: string
          vendor_id?: string
          vendor_invoice_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
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
          booking_number: string
          client_id: string
          created_at: string
          created_by: string
          customer_quote_id: string | null
          destination_id: string | null
          id: string
          notes: string | null
          quote_itinerary: Json | null
          status: Database["public"]["Enums"]["sale_status"]
          travel_date: string | null
          updated_at: string
        }
        Insert: {
          billing_type?: Database["public"]["Enums"]["billing_type"]
          booking_date?: string
          booking_number?: string
          client_id: string
          created_at?: string
          created_by?: string
          customer_quote_id?: string | null
          destination_id?: string | null
          id?: string
          notes?: string | null
          quote_itinerary?: Json | null
          status?: Database["public"]["Enums"]["sale_status"]
          travel_date?: string | null
          updated_at?: string
        }
        Update: {
          billing_type?: Database["public"]["Enums"]["billing_type"]
          booking_date?: string
          booking_number?: string
          client_id?: string
          created_at?: string
          created_by?: string
          customer_quote_id?: string | null
          destination_id?: string | null
          id?: string
          notes?: string | null
          quote_itinerary?: Json | null
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
            foreignKeyName: "sales_customer_quote_id_fkey"
            columns: ["customer_quote_id"]
            isOneToOne: true
            referencedRelation: "customer_quotes"
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
      supplier_quote_files: {
        Row: {
          content_type: string
          created_at: string
          file_name: string
          id: string
          size_bytes: number
          storage_path: string
          supplier_quote_id: string
          uploaded_by: string
        }
        Insert: {
          content_type: string
          created_at?: string
          file_name: string
          id?: string
          size_bytes: number
          storage_path: string
          supplier_quote_id: string
          uploaded_by: string
        }
        Update: {
          content_type?: string
          created_at?: string
          file_name?: string
          id?: string
          size_bytes?: number
          storage_path?: string
          supplier_quote_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_quote_files_supplier_quote_id_fkey"
            columns: ["supplier_quote_id"]
            isOneToOne: false
            referencedRelation: "supplier_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quote_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_quote_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
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
          not_in_total: boolean
          option_label: string | null
          price_basis: string
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
          not_in_total?: boolean
          option_label?: string | null
          price_basis?: string
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
          not_in_total?: boolean
          option_label?: string | null
          price_basis?: string
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
          adults: number | null
          child_ages: string | null
          children: number | null
          created_at: string
          created_by: string
          exclusions: string | null
          id: string
          inclusions: string | null
          is_superseded: boolean
          itinerary_notes: string | null
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
          adults?: number | null
          child_ages?: string | null
          children?: number | null
          created_at?: string
          created_by: string
          exclusions?: string | null
          id?: string
          inclusions?: string | null
          is_superseded?: boolean
          itinerary_notes?: string | null
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
          adults?: number | null
          child_ages?: string | null
          children?: number | null
          created_at?: string
          created_by?: string
          exclusions?: string | null
          id?: string
          inclusions?: string | null
          is_superseded?: boolean
          itinerary_notes?: string | null
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
      vendor_payment_allocations: {
        Row: {
          amount_inr: number
          created_at: string
          id: string
          payment_id: string
          purchase_id: string
          updated_at: string
        }
        Insert: {
          amount_inr: number
          created_at?: string
          id?: string
          payment_id: string
          purchase_id: string
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          created_at?: string
          id?: string
          payment_id?: string
          purchase_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "vendor_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payment_allocations_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payments: {
        Row: {
          amount_inr: number
          cancel_reason: string | null
          created_at: string
          created_by: string
          id: string
          method: string
          notes: string | null
          payment_date: string
          payment_number: string
          payment_type: string
          reference: string | null
          sale_id: string | null
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount_inr: number
          cancel_reason?: string | null
          created_at?: string
          created_by?: string
          id?: string
          method: string
          notes?: string | null
          payment_date?: string
          payment_number?: string
          payment_type?: string
          reference?: string | null
          sale_id?: string | null
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount_inr?: number
          cancel_reason?: string | null
          created_at?: string
          created_by?: string
          id?: string
          method?: string
          notes?: string | null
          payment_date?: string
          payment_number?: string
          payment_type?: string
          reference?: string | null
          sale_id?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string | null
          advance_rule: string | null
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          payment_terms: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          advance_rule?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          advance_rule?: string | null
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          payment_terms?: string | null
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
      convert_customer_quote_to_booking: {
        Args: { _quote_id: string }
        Returns: string
      }
      create_customer_quote_revision: {
        Args: { _quote_id: string }
        Returns: string
      }
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
      get_shared_customer_quote: {
        Args: { _token: string; _track?: boolean }
        Returns: Json
      }
      save_vendor_payment: {
        Args: { _allocations: Json; _id: string; _values: Json }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "sales" | "operations" | "accounts" | "viewer"
      billing_type: "tour_package" | "standalone_service"
      customer_quote_status:
        | "draft"
        | "sent"
        | "accepted"
        | "rejected"
        | "expired"
        | "superseded"
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
        | "land_package"
        | "full_package"
      sale_item_type:
        | "hotel"
        | "flight"
        | "visa"
        | "activity"
        | "transport"
        | "other"
        | "land_package"
        | "full_package"
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
      customer_quote_status: [
        "draft",
        "sent",
        "accepted",
        "rejected",
        "expired",
        "superseded",
      ],
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
        "land_package",
        "full_package",
      ],
      sale_item_type: [
        "hotel",
        "flight",
        "visa",
        "activity",
        "transport",
        "other",
        "land_package",
        "full_package",
      ],
      sale_status: ["pending", "confirmed", "completed", "cancelled"],
      supplier_quote_status: ["requested", "received", "selected", "rejected"],
    },
  },
} as const
