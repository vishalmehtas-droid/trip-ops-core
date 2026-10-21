-- Live schema snapshot, exported from Lovable Cloud on 2026-10-21 with supabase/export_schema.sql.
-- Reference only, not a replayable migration. Postgres 17.6.
-- Part 1 (supabase/export_schema.sql): public schema, storage buckets and storage policies.
-- Part 2 (supabase/export_app_schema.sql): the "app" schema with the permission, guard,
-- audit and pricing functions, plus drizzle's unused migrations table.

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE TYPE public.app_role AS ENUM ('admin', 'sales', 'operations', 'accounts', 'viewer');

CREATE TYPE public.billing_type AS ENUM ('tour_package', 'standalone_service');

CREATE TYPE public.customer_quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired', 'superseded');

CREATE TYPE public.lead_status AS ENUM ('new', 'in_progress', 'quoted', 'negotiation', 'won', 'lost');

CREATE TYPE public.markup_type AS ENUM ('percentage', 'lumpsum', 'none');

CREATE TYPE public.requirement_status AS ENUM ('draft', 'active', 'superseded', 'closed');

CREATE TYPE public.sale_cost_type AS ENUM ('hotel', 'flight', 'visa', 'activity', 'transport', 'tour_package', 'other', 'land_package', 'full_package');

CREATE TYPE public.sale_item_type AS ENUM ('hotel', 'flight', 'visa', 'activity', 'transport', 'other', 'land_package', 'full_package');

CREATE TYPE public.sale_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');

CREATE TYPE public.supplier_quote_status AS ENUM ('requested', 'received', 'selected', 'rejected');

CREATE SEQUENCE IF NOT EXISTS public.booking_number_seq START 1 INCREMENT 1; -- last_value: 4

CREATE SEQUENCE IF NOT EXISTS public.customer_quote_number_seq START 1 INCREMENT 1; -- last_value: 8

CREATE SEQUENCE IF NOT EXISTS public.customer_receipt_number_seq START 1 INCREMENT 1; -- last_value: 4

CREATE SEQUENCE IF NOT EXISTS public.lead_number_seq START 1 INCREMENT 1; -- last_value: 5

CREATE SEQUENCE IF NOT EXISTS public.other_transaction_number_seq START 1 INCREMENT 1; -- last_value: unused

CREATE SEQUENCE IF NOT EXISTS public.purchase_number_seq START 1 INCREMENT 1; -- last_value: 2

CREATE SEQUENCE IF NOT EXISTS public.requirement_number_seq START 1 INCREMENT 1; -- last_value: 6

CREATE SEQUENCE IF NOT EXISTS public.supplier_quote_number_seq START 1 INCREMENT 1; -- last_value: 6

CREATE SEQUENCE IF NOT EXISTS public.vendor_payment_number_seq START 1 INCREMENT 1; -- last_value: 2

CREATE TABLE public.accounts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL,
  last4 text,
  opening_balance numeric(14,2) DEFAULT 0 NOT NULL,
  opening_balance_date date DEFAULT CURRENT_DATE NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.app_settings (
  id boolean DEFAULT true NOT NULL,
  default_markup_percent numeric(7,2) DEFAULT 10 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.audit_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.clients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  address text,
  gst_number text,
  notes text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  source text,
  referred_by text,
  markup_percent_override numeric(7,2),
  state text,
  city text,
  created_by uuid DEFAULT auth.uid()
);

CREATE TABLE public.company_settings (
  id boolean DEFAULT true NOT NULL,
  legal_name text,
  trade_name text,
  gstin text,
  address text,
  state text,
  phone text,
  email text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_ifsc text,
  upi_id text,
  logo_path text,
  invoice_prefix text DEFAULT 'INV'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_quote_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_quote_id uuid NOT NULL,
  source_supplier_quote_line_id uuid,
  purchase_type sale_item_type NOT NULL,
  description text NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  currency text DEFAULT 'INR'::text NOT NULL,
  expected_cost_inr numeric(14,2) DEFAULT 0 NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_quote_pricing (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  customer_quote_id uuid NOT NULL,
  billing_type billing_type DEFAULT 'tour_package'::billing_type NOT NULL,
  markup_type markup_type DEFAULT 'none'::markup_type NOT NULL,
  markup_value numeric(14,2) DEFAULT 0 NOT NULL,
  markup_amount numeric(14,2) DEFAULT 0 NOT NULL,
  discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
  selling_value numeric(14,2) DEFAULT 0 NOT NULL,
  service_charge_amount numeric(14,2) DEFAULT 0 NOT NULL,
  gst_rate numeric(5,2) DEFAULT 5 NOT NULL,
  gst_amount numeric(14,2) DEFAULT 0 NOT NULL,
  tcs_applicable boolean DEFAULT false NOT NULL,
  tcs_rate numeric(5,2),
  tcs_amount numeric(14,2) DEFAULT 0 NOT NULL,
  customer_payable numeric(14,2) DEFAULT 0 NOT NULL,
  expected_cost numeric(14,2) DEFAULT 0 NOT NULL,
  expected_gross_profit numeric(14,2) DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_quotes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quote_number text NOT NULL,
  lead_id uuid NOT NULL,
  requirement_id uuid NOT NULL,
  client_id uuid NOT NULL,
  revision_no integer DEFAULT 1 NOT NULL,
  previous_quote_id uuid,
  status customer_quote_status DEFAULT 'draft'::customer_quote_status NOT NULL,
  valid_until date,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  public_title text,
  summary text,
  inclusions text,
  exclusions text,
  itinerary text,
  terms text,
  share_token text DEFAULT (replace((gen_random_uuid())::text, '-'::text, ''::text) || replace((gen_random_uuid())::text, '-'::text, ''::text)) NOT NULL,
  share_enabled boolean DEFAULT false NOT NULL,
  view_count integer DEFAULT 0 NOT NULL,
  last_viewed_at timestamp with time zone
);

CREATE TABLE public.customer_receipt_allocations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  receipt_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  amount_inr numeric(14,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.customer_receipts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  receipt_number text DEFAULT ''::text NOT NULL,
  sale_id uuid,
  payment_type text DEFAULT 'part'::text NOT NULL,
  receipt_date date DEFAULT CURRENT_DATE NOT NULL,
  amount_inr numeric(14,2) NOT NULL,
  method text NOT NULL,
  reference text,
  notes text,
  status text DEFAULT 'recorded'::text NOT NULL,
  cancel_reason text,
  created_by uuid DEFAULT auth.uid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  account_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
  cleared boolean DEFAULT false NOT NULL,
  cleared_on date,
  client_id uuid
);

CREATE TABLE public.destinations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  country text,
  region text,
  notes text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.invoice_counters (
  financial_year text NOT NULL,
  last_number integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_number text NOT NULL,
  financial_year text NOT NULL,
  sequence_no integer NOT NULL,
  sale_id uuid NOT NULL,
  client_id uuid NOT NULL,
  invoice_date date NOT NULL,
  client_name text NOT NULL,
  total_payable numeric(14,2) NOT NULL,
  snapshot jsonb NOT NULL,
  status text DEFAULT 'issued'::text NOT NULL,
  cancel_reason text,
  cancelled_at timestamp with time zone,
  cancelled_by uuid,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_number text NOT NULL,
  client_id uuid NOT NULL,
  enquiry_date date DEFAULT CURRENT_DATE NOT NULL,
  assigned_to uuid NOT NULL,
  source text,
  status lead_status DEFAULT 'new'::lead_status NOT NULL,
  notes text,
  created_by uuid DEFAULT auth.uid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  follow_up_date date
);

CREATE TABLE public.other_transactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  entry_number text DEFAULT ''::text NOT NULL,
  txn_type text NOT NULL,
  txn_date date DEFAULT CURRENT_DATE NOT NULL,
  amount_inr numeric(14,2) NOT NULL,
  account_id uuid NOT NULL,
  to_account_id uuid,
  category text,
  party text,
  notes text,
  reference text,
  status text DEFAULT 'recorded'::text NOT NULL,
  cancel_reason text,
  cleared boolean DEFAULT false NOT NULL,
  cleared_on date,
  created_by uuid DEFAULT auth.uid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.permissions (
  key text NOT NULL,
  module text NOT NULL,
  description text DEFAULT ''::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  name text DEFAULT ''::text NOT NULL,
  email text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.purchases (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  purchase_number text DEFAULT ''::text NOT NULL,
  sale_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  vendor_invoice_number text,
  invoice_date date DEFAULT CURRENT_DATE NOT NULL,
  currency_code text DEFAULT 'INR'::text NOT NULL,
  exchange_rate numeric(14,6) DEFAULT 1 NOT NULL,
  amount numeric(14,2) NOT NULL,
  amount_inr numeric(14,2) DEFAULT 0 NOT NULL,
  notes text,
  status text DEFAULT 'recorded'::text NOT NULL,
  cancel_reason text,
  created_by uuid DEFAULT auth.uid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.role_permissions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  role app_role NOT NULL,
  permission_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sale_costs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sale_id uuid NOT NULL,
  vendor_id uuid,
  cost_type sale_cost_type NOT NULL,
  description text NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  unit_cost numeric(14,2) NOT NULL,
  total_cost numeric(14,2) DEFAULT 0 NOT NULL,
  currency_code text DEFAULT 'INR'::text NOT NULL,
  exchange_rate numeric(14,6) DEFAULT 1 NOT NULL,
  base_currency_cost numeric(14,2) DEFAULT 0 NOT NULL,
  notes text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sale_pricing (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sale_id uuid NOT NULL,
  markup_type markup_type DEFAULT 'none'::markup_type NOT NULL,
  markup_value numeric(14,2) DEFAULT 0 NOT NULL,
  markup_amount numeric(14,2) DEFAULT 0 NOT NULL,
  discount_amount numeric(14,2) DEFAULT 0 NOT NULL,
  selling_value numeric(14,2) DEFAULT 0 NOT NULL,
  service_charge_amount numeric(14,2) DEFAULT 0 NOT NULL,
  gst_rate numeric(5,2) DEFAULT 5 NOT NULL,
  gst_amount numeric(14,2) DEFAULT 0 NOT NULL,
  tcs_applicable boolean DEFAULT false NOT NULL,
  tcs_rate numeric(5,2),
  tcs_amount numeric(14,2) DEFAULT 0 NOT NULL,
  customer_payable numeric(14,2) DEFAULT 0 NOT NULL,
  expected_cost numeric(14,2) DEFAULT 0 NOT NULL,
  expected_gross_profit numeric(14,2) DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sales (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  client_id uuid NOT NULL,
  destination_id uuid,
  booking_date date DEFAULT CURRENT_DATE NOT NULL,
  travel_date date,
  status sale_status DEFAULT 'pending'::sale_status NOT NULL,
  notes text,
  created_by uuid DEFAULT auth.uid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  billing_type billing_type DEFAULT 'tour_package'::billing_type NOT NULL,
  customer_quote_id uuid,
  quote_itinerary jsonb,
  booking_number text DEFAULT ''::text NOT NULL
);

CREATE TABLE public.sales_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sale_id uuid NOT NULL,
  item_type sale_item_type NOT NULL,
  description text NOT NULL,
  vendor_id uuid,
  quantity integer DEFAULT 1 NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.supplier_quote_files (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  supplier_quote_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  content_type text NOT NULL,
  size_bytes bigint NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.supplier_quote_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  supplier_quote_id uuid NOT NULL,
  is_package boolean DEFAULT false NOT NULL,
  purchase_type sale_item_type NOT NULL,
  description text NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  currency text DEFAULT 'INR'::text NOT NULL,
  unit_amount numeric(14,2) NOT NULL,
  exchange_rate numeric DEFAULT 1 NOT NULL,
  amount_inr numeric(14,2) DEFAULT 0 NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  price_basis text DEFAULT 'total'::text NOT NULL,
  option_label text,
  not_in_total boolean DEFAULT false NOT NULL
);

CREATE TABLE public.supplier_quotes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quote_number text NOT NULL,
  lead_id uuid NOT NULL,
  requirement_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  status supplier_quote_status DEFAULT 'requested'::supplier_quote_status NOT NULL,
  valid_until date,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  revision_number integer DEFAULT 1 NOT NULL,
  previous_quote_id uuid,
  is_superseded boolean DEFAULT false NOT NULL,
  adults integer,
  children integer,
  child_ages text,
  inclusions text,
  exclusions text,
  itinerary_notes text
);

CREATE TABLE public.travel_requirement_destinations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  requirement_id uuid NOT NULL,
  destination_id uuid NOT NULL,
  sequence_order integer DEFAULT 1 NOT NULL,
  nights integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.travel_requirements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  requirement_number text NOT NULL,
  lead_id uuid NOT NULL,
  travel_start_date date,
  travel_end_date date,
  adults integer DEFAULT 1 NOT NULL,
  children integer DEFAULT 0 NOT NULL,
  rooms integer,
  trip_type text,
  budget numeric(14,2),
  notes text,
  status requirement_status DEFAULT 'active'::requirement_status NOT NULL,
  created_by uuid DEFAULT auth.uid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.vendor_payment_allocations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_id uuid NOT NULL,
  purchase_id uuid NOT NULL,
  amount_inr numeric(14,2) NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.vendor_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  payment_number text DEFAULT ''::text NOT NULL,
  vendor_id uuid NOT NULL,
  sale_id uuid,
  payment_type text DEFAULT 'part'::text NOT NULL,
  payment_date date DEFAULT CURRENT_DATE NOT NULL,
  amount_inr numeric(14,2) NOT NULL,
  method text NOT NULL,
  reference text,
  notes text,
  status text DEFAULT 'recorded'::text NOT NULL,
  cancel_reason text,
  created_by uuid DEFAULT auth.uid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  account_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
  cleared boolean DEFAULT false NOT NULL,
  cleared_on date
);

CREATE TABLE public.vendors (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  gst_number text,
  address text,
  notes text,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  payment_terms text,
  advance_rule text,
  city text,
  created_by uuid DEFAULT auth.uid()
);

ALTER TABLE public.accounts ADD CONSTRAINT accounts_account_type_check CHECK ((account_type = ANY (ARRAY['bank'::text, 'credit_card'::text, 'cash'::text, 'upi_wallet'::text])));

ALTER TABLE public.accounts ADD CONSTRAINT accounts_last4_check CHECK (((last4 IS NULL) OR (last4 ~ '^[0-9]{4}$'::text)));

ALTER TABLE public.accounts ADD CONSTRAINT accounts_name_check CHECK (((btrim(name) <> ''::text) AND (char_length(name) <= 120)));

ALTER TABLE public.accounts ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);

ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_default_markup_percent_check CHECK (((default_markup_percent >= (0)::numeric) AND (default_markup_percent <= (1000)::numeric)));

ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_id_check CHECK (id);

ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);

ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);

ALTER TABLE public.clients ADD CONSTRAINT clients_city_check CHECK (((city IS NULL) OR (char_length(city) <= 120)));

ALTER TABLE public.clients ADD CONSTRAINT clients_markup_percent_override_check CHECK (((markup_percent_override IS NULL) OR ((markup_percent_override >= (0)::numeric) AND (markup_percent_override <= (1000)::numeric))));

ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);

ALTER TABLE public.clients ADD CONSTRAINT clients_referred_by_check CHECK (((referred_by IS NULL) OR ((char_length(referred_by) <= 120) AND (source = 'Referral'::text))));

ALTER TABLE public.clients ADD CONSTRAINT clients_source_check CHECK (((source IS NULL) OR (source = ANY (ARRAY['Referral'::text, 'Repeat client'::text, 'Instagram'::text, 'Facebook'::text, 'WhatsApp'::text, 'Google'::text, 'Website'::text, 'Walk-in'::text, 'Other'::text]))));

ALTER TABLE public.clients ADD CONSTRAINT clients_state_check CHECK (((state IS NULL) OR (char_length(state) <= 80)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_address_check CHECK (((address IS NULL) OR (char_length(address) <= 600)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_bank_account_name_check CHECK (((bank_account_name IS NULL) OR (char_length(bank_account_name) <= 160)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_bank_account_number_check CHECK (((bank_account_number IS NULL) OR (char_length(bank_account_number) <= 40)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_bank_ifsc_check CHECK (((bank_ifsc IS NULL) OR (char_length(bank_ifsc) <= 20)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_bank_name_check CHECK (((bank_name IS NULL) OR (char_length(bank_name) <= 120)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_email_check CHECK (((email IS NULL) OR (char_length(email) <= 200)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_gstin_check CHECK (((gstin IS NULL) OR (char_length(gstin) <= 20)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_id_check CHECK (id);

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_invoice_prefix_check CHECK ((invoice_prefix ~ '^[A-Za-z0-9-]{1,10}$'::text));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_legal_name_check CHECK (((legal_name IS NULL) OR (char_length(legal_name) <= 200)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_logo_path_check CHECK (((logo_path IS NULL) OR (char_length(logo_path) <= 300)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_phone_check CHECK (((phone IS NULL) OR (char_length(phone) <= 40)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_pkey PRIMARY KEY (id);

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_state_check CHECK (((state IS NULL) OR (char_length(state) <= 80)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_trade_name_check CHECK (((trade_name IS NULL) OR (char_length(trade_name) <= 200)));

ALTER TABLE public.company_settings ADD CONSTRAINT company_settings_upi_id_check CHECK (((upi_id IS NULL) OR (char_length(upi_id) <= 100)));

ALTER TABLE public.customer_quote_lines ADD CONSTRAINT customer_quote_lines_expected_cost_inr_check CHECK ((expected_cost_inr >= (0)::numeric));

ALTER TABLE public.customer_quote_lines ADD CONSTRAINT customer_quote_lines_pkey PRIMARY KEY (id);

ALTER TABLE public.customer_quote_lines ADD CONSTRAINT customer_quote_lines_quantity_check CHECK ((quantity > 0));

ALTER TABLE public.customer_quote_pricing ADD CONSTRAINT customer_quote_pricing_customer_quote_id_key UNIQUE (customer_quote_id);

ALTER TABLE public.customer_quote_pricing ADD CONSTRAINT customer_quote_pricing_discount_amount_check CHECK ((discount_amount >= (0)::numeric));

ALTER TABLE public.customer_quote_pricing ADD CONSTRAINT customer_quote_pricing_markup_value_check CHECK ((markup_value >= (0)::numeric));

ALTER TABLE public.customer_quote_pricing ADD CONSTRAINT customer_quote_pricing_pkey PRIMARY KEY (id);

ALTER TABLE public.customer_quote_pricing ADD CONSTRAINT customer_quote_pricing_tcs_rate_check CHECK (((tcs_rate IS NULL) OR ((tcs_rate >= (0)::numeric) AND (tcs_rate <= (100)::numeric))));

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_exclusions_check CHECK ((char_length(exclusions) <= 8000));

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_inclusions_check CHECK ((char_length(inclusions) <= 8000));

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_itinerary_check CHECK ((char_length(itinerary) <= 8000));

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_pkey PRIMARY KEY (id);

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_public_title_check CHECK ((char_length(public_title) <= 8000));

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_quote_number_key UNIQUE (quote_number);

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_share_token_check CHECK ((char_length(share_token) >= 32));

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_summary_check CHECK ((char_length(summary) <= 8000));

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_terms_check CHECK ((char_length(terms) <= 8000));

ALTER TABLE public.customer_receipt_allocations ADD CONSTRAINT customer_receipt_allocations_amount_inr_check CHECK ((amount_inr > (0)::numeric));

ALTER TABLE public.customer_receipt_allocations ADD CONSTRAINT customer_receipt_allocations_pkey PRIMARY KEY (id);

ALTER TABLE public.customer_receipt_allocations ADD CONSTRAINT customer_receipt_allocations_unique UNIQUE (receipt_id, sale_id);

ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_amount_inr_check CHECK ((amount_inr > (0)::numeric));

ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_cancel_reason_required CHECK (((status <> 'cancelled'::text) OR ((cancel_reason IS NOT NULL) AND (btrim(cancel_reason) <> ''::text))));

ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_client_required CHECK ((client_id IS NOT NULL));

ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_method_check CHECK ((method = ANY (ARRAY['bank_transfer'::text, 'upi'::text, 'cash'::text, 'cheque'::text, 'card'::text, 'other'::text])));

ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_payment_type_check CHECK ((payment_type = ANY (ARRAY['advance'::text, 'part'::text, 'final'::text])));

ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_pkey PRIMARY KEY (id);

ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_receipt_number_key UNIQUE (receipt_number);

ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_status_check CHECK ((status = ANY (ARRAY['recorded'::text, 'cancelled'::text])));

ALTER TABLE public.destinations ADD CONSTRAINT destinations_pkey PRIMARY KEY (id);

ALTER TABLE public.invoice_counters ADD CONSTRAINT invoice_counters_pkey PRIMARY KEY (financial_year);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_financial_year_sequence_no_key UNIQUE (financial_year, sequence_no);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['issued'::text, 'cancelled'::text])));

ALTER TABLE public.leads ADD CONSTRAINT leads_lead_number_key UNIQUE (lead_number);

ALTER TABLE public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_amount_inr_check CHECK ((amount_inr > (0)::numeric));

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_cancel_reason_required CHECK (((status <> 'cancelled'::text) OR ((cancel_reason IS NOT NULL) AND (btrim(cancel_reason) <> ''::text))));

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_category_check CHECK (((category IS NULL) OR (char_length(category) <= 80)));

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_entry_number_key UNIQUE (entry_number);

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_notes_check CHECK (((notes IS NULL) OR (char_length(notes) <= 2000)));

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_party_check CHECK (((party IS NULL) OR (char_length(party) <= 200)));

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_pkey PRIMARY KEY (id);

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_reference_check CHECK (((reference IS NULL) OR (char_length(reference) <= 200)));

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_status_check CHECK ((status = ANY (ARRAY['recorded'::text, 'cancelled'::text])));

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_transfer_accounts CHECK ((((txn_type = 'transfer'::text) AND (to_account_id IS NOT NULL) AND (to_account_id <> account_id)) OR ((txn_type <> 'transfer'::text) AND (to_account_id IS NULL))));

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_txn_type_check CHECK ((txn_type = ANY (ARRAY['expense'::text, 'income'::text, 'transfer'::text])));

ALTER TABLE public.permissions ADD CONSTRAINT permissions_pkey PRIMARY KEY (key);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.purchases ADD CONSTRAINT purchases_amount_check CHECK ((amount > (0)::numeric));

ALTER TABLE public.purchases ADD CONSTRAINT purchases_cancel_reason_check CHECK (((cancel_reason IS NULL) OR (char_length(cancel_reason) <= 1000)));

ALTER TABLE public.purchases ADD CONSTRAINT purchases_cancel_reason_required CHECK (((status <> 'cancelled'::text) OR ((cancel_reason IS NOT NULL) AND (btrim(cancel_reason) <> ''::text))));

ALTER TABLE public.purchases ADD CONSTRAINT purchases_currency_code_check CHECK ((currency_code ~ '^[A-Z]{3}$'::text));

ALTER TABLE public.purchases ADD CONSTRAINT purchases_exchange_rate_check CHECK ((exchange_rate > (0)::numeric));

ALTER TABLE public.purchases ADD CONSTRAINT purchases_notes_check CHECK (((notes IS NULL) OR (char_length(notes) <= 2000)));

ALTER TABLE public.purchases ADD CONSTRAINT purchases_pkey PRIMARY KEY (id);

ALTER TABLE public.purchases ADD CONSTRAINT purchases_purchase_number_key UNIQUE (purchase_number);

ALTER TABLE public.purchases ADD CONSTRAINT purchases_status_check CHECK ((status = ANY (ARRAY['recorded'::text, 'cancelled'::text])));

ALTER TABLE public.purchases ADD CONSTRAINT purchases_vendor_invoice_number_check CHECK (((vendor_invoice_number IS NULL) OR (char_length(vendor_invoice_number) <= 100)));

ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);

ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_role_permission_key_key UNIQUE (role, permission_key);

ALTER TABLE public.sale_costs ADD CONSTRAINT sale_costs_currency_code_check CHECK ((currency_code ~ '^[A-Z]{3}$'::text));

ALTER TABLE public.sale_costs ADD CONSTRAINT sale_costs_description_check CHECK ((btrim(description) <> ''::text));

ALTER TABLE public.sale_costs ADD CONSTRAINT sale_costs_exchange_rate_check CHECK ((exchange_rate > (0)::numeric));

ALTER TABLE public.sale_costs ADD CONSTRAINT sale_costs_pkey PRIMARY KEY (id);

ALTER TABLE public.sale_costs ADD CONSTRAINT sale_costs_quantity_check CHECK ((quantity > 0));

ALTER TABLE public.sale_costs ADD CONSTRAINT sale_costs_unit_cost_check CHECK ((unit_cost >= (0)::numeric));

ALTER TABLE public.sale_pricing ADD CONSTRAINT sale_pricing_discount_amount_check CHECK ((discount_amount >= (0)::numeric));

ALTER TABLE public.sale_pricing ADD CONSTRAINT sale_pricing_markup_value_check CHECK ((markup_value >= (0)::numeric));

ALTER TABLE public.sale_pricing ADD CONSTRAINT sale_pricing_pkey PRIMARY KEY (id);

ALTER TABLE public.sale_pricing ADD CONSTRAINT sale_pricing_sale_id_key UNIQUE (sale_id);

ALTER TABLE public.sale_pricing ADD CONSTRAINT sale_pricing_tcs_rate_check CHECK (((tcs_rate IS NULL) OR ((tcs_rate >= (0)::numeric) AND (tcs_rate <= (100)::numeric))));

ALTER TABLE public.sales ADD CONSTRAINT sales_booking_number_key UNIQUE (booking_number);

ALTER TABLE public.sales ADD CONSTRAINT sales_customer_quote_id_key UNIQUE (customer_quote_id);

ALTER TABLE public.sales ADD CONSTRAINT sales_pkey PRIMARY KEY (id);

ALTER TABLE public.sales ADD CONSTRAINT sales_travel_after_booking CHECK (((travel_date IS NULL) OR (travel_date >= booking_date)));

ALTER TABLE public.sales_items ADD CONSTRAINT sales_items_description_not_blank CHECK ((length(btrim(description)) > 0));

ALTER TABLE public.sales_items ADD CONSTRAINT sales_items_pkey PRIMARY KEY (id);

ALTER TABLE public.sales_items ADD CONSTRAINT sales_items_quantity_positive CHECK ((quantity > 0));

ALTER TABLE public.supplier_quote_files ADD CONSTRAINT supplier_quote_files_content_type_check CHECK ((content_type = ANY (ARRAY['application/pdf'::text, 'image/png'::text, 'image/jpeg'::text, 'image/webp'::text, 'text/plain'::text, 'message/rfc822'::text])));

ALTER TABLE public.supplier_quote_files ADD CONSTRAINT supplier_quote_files_file_name_check CHECK (((char_length(file_name) >= 1) AND (char_length(file_name) <= 255)));

ALTER TABLE public.supplier_quote_files ADD CONSTRAINT supplier_quote_files_pkey PRIMARY KEY (id);

ALTER TABLE public.supplier_quote_files ADD CONSTRAINT supplier_quote_files_size_bytes_check CHECK (((size_bytes > 0) AND (size_bytes <= 10485760)));

ALTER TABLE public.supplier_quote_files ADD CONSTRAINT supplier_quote_files_storage_path_key UNIQUE (storage_path);

ALTER TABLE public.supplier_quote_lines ADD CONSTRAINT supplier_quote_lines_exchange_rate_check CHECK ((exchange_rate > (0)::numeric));

ALTER TABLE public.supplier_quote_lines ADD CONSTRAINT supplier_quote_lines_option_label_check CHECK (((option_label IS NULL) OR (char_length(option_label) <= 200)));

ALTER TABLE public.supplier_quote_lines ADD CONSTRAINT supplier_quote_lines_pkey PRIMARY KEY (id);

ALTER TABLE public.supplier_quote_lines ADD CONSTRAINT supplier_quote_lines_price_basis_check CHECK ((price_basis = ANY (ARRAY['per_person'::text, 'per_room'::text, 'total'::text])));

ALTER TABLE public.supplier_quote_lines ADD CONSTRAINT supplier_quote_lines_quantity_check CHECK ((quantity > 0));

ALTER TABLE public.supplier_quote_lines ADD CONSTRAINT supplier_quote_lines_unit_amount_check CHECK ((unit_amount >= (0)::numeric));

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_adults_check CHECK (((adults IS NULL) OR ((adults >= 0) AND (adults <= 999))));

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_child_ages_check CHECK (((child_ages IS NULL) OR (char_length(child_ages) <= 8000)));

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_children_check CHECK (((children IS NULL) OR ((children >= 0) AND (children <= 999))));

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_exclusions_check CHECK (((exclusions IS NULL) OR (char_length(exclusions) <= 8000)));

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_inclusions_check CHECK (((inclusions IS NULL) OR (char_length(inclusions) <= 8000)));

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_itinerary_notes_check CHECK (((itinerary_notes IS NULL) OR (char_length(itinerary_notes) <= 8000)));

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_pkey PRIMARY KEY (id);

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_quote_number_key UNIQUE (quote_number);

ALTER TABLE public.travel_requirement_destinations ADD CONSTRAINT travel_requirement_destinatio_requirement_id_sequence_order_key UNIQUE (requirement_id, sequence_order);

ALTER TABLE public.travel_requirement_destinations ADD CONSTRAINT travel_requirement_destinations_nights_check CHECK (((nights IS NULL) OR (nights >= 0)));

ALTER TABLE public.travel_requirement_destinations ADD CONSTRAINT travel_requirement_destinations_pkey PRIMARY KEY (id);

ALTER TABLE public.travel_requirement_destinations ADD CONSTRAINT travel_requirement_destinations_sequence_order_check CHECK ((sequence_order >= 1));

ALTER TABLE public.travel_requirements ADD CONSTRAINT travel_requirements_adults_check CHECK ((adults >= 1));

ALTER TABLE public.travel_requirements ADD CONSTRAINT travel_requirements_budget_check CHECK (((budget IS NULL) OR (budget >= (0)::numeric)));

ALTER TABLE public.travel_requirements ADD CONSTRAINT travel_requirements_children_check CHECK ((children >= 0));

ALTER TABLE public.travel_requirements ADD CONSTRAINT travel_requirements_dates_ordered CHECK (((travel_start_date IS NULL) OR (travel_end_date IS NULL) OR (travel_end_date >= travel_start_date)));

ALTER TABLE public.travel_requirements ADD CONSTRAINT travel_requirements_pkey PRIMARY KEY (id);

ALTER TABLE public.travel_requirements ADD CONSTRAINT travel_requirements_requirement_number_key UNIQUE (requirement_number);

ALTER TABLE public.travel_requirements ADD CONSTRAINT travel_requirements_rooms_check CHECK (((rooms IS NULL) OR (rooms >= 0)));

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

ALTER TABLE public.vendor_payment_allocations ADD CONSTRAINT vendor_payment_allocations_amount_inr_check CHECK ((amount_inr > (0)::numeric));

ALTER TABLE public.vendor_payment_allocations ADD CONSTRAINT vendor_payment_allocations_pkey PRIMARY KEY (id);

ALTER TABLE public.vendor_payment_allocations ADD CONSTRAINT vendor_payment_allocations_unique UNIQUE (payment_id, purchase_id);

ALTER TABLE public.vendor_payments ADD CONSTRAINT vendor_payments_amount_inr_check CHECK ((amount_inr > (0)::numeric));

ALTER TABLE public.vendor_payments ADD CONSTRAINT vendor_payments_cancel_reason_required CHECK (((status <> 'cancelled'::text) OR ((cancel_reason IS NOT NULL) AND (btrim(cancel_reason) <> ''::text))));

ALTER TABLE public.vendor_payments ADD CONSTRAINT vendor_payments_method_check CHECK ((method = ANY (ARRAY['bank_transfer'::text, 'upi'::text, 'cash'::text, 'cheque'::text, 'card'::text, 'other'::text])));

ALTER TABLE public.vendor_payments ADD CONSTRAINT vendor_payments_payment_number_key UNIQUE (payment_number);

ALTER TABLE public.vendor_payments ADD CONSTRAINT vendor_payments_payment_type_check CHECK ((payment_type = ANY (ARRAY['advance'::text, 'part'::text, 'final'::text])));

ALTER TABLE public.vendor_payments ADD CONSTRAINT vendor_payments_pkey PRIMARY KEY (id);

ALTER TABLE public.vendor_payments ADD CONSTRAINT vendor_payments_status_check CHECK ((status = ANY (ARRAY['recorded'::text, 'cancelled'::text])));

ALTER TABLE public.vendors ADD CONSTRAINT vendors_advance_rule_length CHECK (((advance_rule IS NULL) OR (char_length(advance_rule) <= 500)));

ALTER TABLE public.vendors ADD CONSTRAINT vendors_city_check CHECK (((city IS NULL) OR (char_length(city) <= 120)));

ALTER TABLE public.vendors ADD CONSTRAINT vendors_payment_terms_length CHECK (((payment_terms IS NULL) OR (char_length(payment_terms) <= 500)));

ALTER TABLE public.vendors ADD CONSTRAINT vendors_pkey PRIMARY KEY (id);

ALTER TABLE public.accounts ADD CONSTRAINT accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.clients ADD CONSTRAINT clients_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.customer_quote_lines ADD CONSTRAINT customer_quote_lines_customer_quote_id_fkey FOREIGN KEY (customer_quote_id) REFERENCES customer_quotes(id);

ALTER TABLE public.customer_quote_lines ADD CONSTRAINT customer_quote_lines_source_supplier_quote_line_id_fkey FOREIGN KEY (source_supplier_quote_line_id) REFERENCES supplier_quote_lines(id) ON DELETE SET NULL;

ALTER TABLE public.customer_quote_pricing ADD CONSTRAINT customer_quote_pricing_customer_quote_id_fkey FOREIGN KEY (customer_quote_id) REFERENCES customer_quotes(id);

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id);

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_previous_quote_id_fkey FOREIGN KEY (previous_quote_id) REFERENCES customer_quotes(id);

ALTER TABLE public.customer_quotes ADD CONSTRAINT customer_quotes_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES travel_requirements(id);

ALTER TABLE public.customer_receipt_allocations ADD CONSTRAINT customer_receipt_allocations_receipt_id_fkey FOREIGN KEY (receipt_id) REFERENCES customer_receipts(id);

ALTER TABLE public.customer_receipt_allocations ADD CONSTRAINT customer_receipt_allocations_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id);

ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id);

ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES profiles(id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.invoices ADD CONSTRAINT invoices_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id);

ALTER TABLE public.leads ADD CONSTRAINT leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.leads ADD CONSTRAINT leads_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;

ALTER TABLE public.leads ADD CONSTRAINT leads_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id);

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.other_transactions ADD CONSTRAINT other_transactions_to_account_id_fkey FOREIGN KEY (to_account_id) REFERENCES accounts(id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.purchases ADD CONSTRAINT purchases_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.purchases ADD CONSTRAINT purchases_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE RESTRICT;

ALTER TABLE public.purchases ADD CONSTRAINT purchases_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT;

ALTER TABLE public.role_permissions ADD CONSTRAINT role_permissions_permission_key_fkey FOREIGN KEY (permission_key) REFERENCES permissions(key) ON DELETE CASCADE;

ALTER TABLE public.sale_costs ADD CONSTRAINT sale_costs_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE RESTRICT;

ALTER TABLE public.sale_costs ADD CONSTRAINT sale_costs_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT;

ALTER TABLE public.sale_pricing ADD CONSTRAINT sale_pricing_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE RESTRICT;

ALTER TABLE public.sales ADD CONSTRAINT sales_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);

ALTER TABLE public.sales ADD CONSTRAINT sales_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.sales ADD CONSTRAINT sales_customer_quote_id_fkey FOREIGN KEY (customer_quote_id) REFERENCES customer_quotes(id) ON DELETE RESTRICT;

ALTER TABLE public.sales ADD CONSTRAINT sales_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES destinations(id);

ALTER TABLE public.sales_items ADD CONSTRAINT sales_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_items ADD CONSTRAINT sales_items_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE RESTRICT;

ALTER TABLE public.supplier_quote_files ADD CONSTRAINT supplier_quote_files_supplier_quote_id_fkey FOREIGN KEY (supplier_quote_id) REFERENCES supplier_quotes(id) ON DELETE RESTRICT;

ALTER TABLE public.supplier_quote_files ADD CONSTRAINT supplier_quote_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id);

ALTER TABLE public.supplier_quote_lines ADD CONSTRAINT supplier_quote_lines_supplier_quote_id_fkey FOREIGN KEY (supplier_quote_id) REFERENCES supplier_quotes(id);

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id);

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_previous_quote_id_fkey FOREIGN KEY (previous_quote_id) REFERENCES supplier_quotes(id);

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES travel_requirements(id);

ALTER TABLE public.supplier_quotes ADD CONSTRAINT supplier_quotes_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);

ALTER TABLE public.travel_requirement_destinations ADD CONSTRAINT travel_requirement_destinations_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES destinations(id) ON DELETE RESTRICT;

ALTER TABLE public.travel_requirement_destinations ADD CONSTRAINT travel_requirement_destinations_requirement_id_fkey FOREIGN KEY (requirement_id) REFERENCES travel_requirements(id) ON DELETE CASCADE;

ALTER TABLE public.travel_requirements ADD CONSTRAINT travel_requirements_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.travel_requirements ADD CONSTRAINT travel_requirements_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE RESTRICT;

ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.vendor_payment_allocations ADD CONSTRAINT vendor_payment_allocations_payment_id_fkey FOREIGN KEY (payment_id) REFERENCES vendor_payments(id);

ALTER TABLE public.vendor_payment_allocations ADD CONSTRAINT vendor_payment_allocations_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES purchases(id);

ALTER TABLE public.vendor_payments ADD CONSTRAINT vendor_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id);

ALTER TABLE public.vendor_payments ADD CONSTRAINT vendor_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.vendor_payments ADD CONSTRAINT vendor_payments_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES sales(id);

ALTER TABLE public.vendor_payments ADD CONSTRAINT vendor_payments_vendor_id_fkey FOREIGN KEY (vendor_id) REFERENCES vendors(id);

ALTER TABLE public.vendors ADD CONSTRAINT vendors_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

CREATE UNIQUE INDEX accounts_name_unique ON public.accounts USING btree (lower(btrim(name)));

CREATE INDEX audit_log_created_at_idx ON public.audit_log USING btree (created_at DESC);

CREATE INDEX audit_log_entity_idx ON public.audit_log USING btree (entity_type, entity_id);

CREATE INDEX clients_active_idx ON public.clients USING btree (is_active);

CREATE INDEX clients_email_idx ON public.clients USING btree (lower(email));

CREATE INDEX clients_name_idx ON public.clients USING btree (lower(name));

CREATE INDEX clients_phone_idx ON public.clients USING btree (phone);

CREATE INDEX customer_quote_lines_quote_idx ON public.customer_quote_lines USING btree (customer_quote_id);

CREATE INDEX customer_quotes_lead_idx ON public.customer_quotes USING btree (lead_id);

CREATE UNIQUE INDEX customer_quotes_previous_unique ON public.customer_quotes USING btree (previous_quote_id) WHERE (previous_quote_id IS NOT NULL);

CREATE INDEX customer_quotes_requirement_idx ON public.customer_quotes USING btree (requirement_id);

CREATE UNIQUE INDEX customer_quotes_share_token_unique ON public.customer_quotes USING btree (share_token);

CREATE INDEX customer_receipt_allocations_sale_idx ON public.customer_receipt_allocations USING btree (sale_id);

CREATE INDEX customer_receipts_account_idx ON public.customer_receipts USING btree (account_id);

CREATE INDEX customer_receipts_client_idx ON public.customer_receipts USING btree (client_id);

CREATE INDEX customer_receipts_date_idx ON public.customer_receipts USING btree (receipt_date);

CREATE INDEX customer_receipts_sale_idx ON public.customer_receipts USING btree (sale_id);

CREATE INDEX destinations_active_idx ON public.destinations USING btree (is_active);

CREATE INDEX destinations_country_idx ON public.destinations USING btree (lower(country));

CREATE INDEX destinations_name_idx ON public.destinations USING btree (lower(name));

CREATE INDEX destinations_region_idx ON public.destinations USING btree (lower(region));

CREATE UNIQUE INDEX invoices_one_active_per_sale ON public.invoices USING btree (sale_id) WHERE (status = 'issued'::text);

CREATE INDEX leads_assigned_idx ON public.leads USING btree (assigned_to);

CREATE INDEX leads_client_idx ON public.leads USING btree (client_id);

CREATE INDEX leads_enquiry_date_idx ON public.leads USING btree (enquiry_date DESC);

CREATE INDEX leads_status_idx ON public.leads USING btree (status);

CREATE INDEX other_transactions_account_idx ON public.other_transactions USING btree (account_id);

CREATE INDEX other_transactions_date_idx ON public.other_transactions USING btree (txn_date);

CREATE INDEX other_transactions_to_account_idx ON public.other_transactions USING btree (to_account_id);

CREATE UNIQUE INDEX profiles_email_lower_key ON public.profiles USING btree (lower(email));

CREATE INDEX purchases_invoice_date_idx ON public.purchases USING btree (invoice_date);

CREATE INDEX purchases_sale_idx ON public.purchases USING btree (sale_id);

CREATE INDEX purchases_vendor_idx ON public.purchases USING btree (vendor_id);

CREATE INDEX sale_costs_sale_idx ON public.sale_costs USING btree (sale_id, sort_order, created_at);

CREATE INDEX sale_costs_vendor_idx ON public.sale_costs USING btree (vendor_id) WHERE (vendor_id IS NOT NULL);

CREATE INDEX sales_booking_date_idx ON public.sales USING btree (booking_date DESC);

CREATE INDEX sales_client_id_idx ON public.sales USING btree (client_id);

CREATE INDEX sales_created_by_idx ON public.sales USING btree (created_by);

CREATE INDEX sales_destination_id_idx ON public.sales USING btree (destination_id);

CREATE INDEX sales_status_idx ON public.sales USING btree (status);

CREATE INDEX sales_items_sale_id_idx ON public.sales_items USING btree (sale_id, sort_order, created_at);

CREATE INDEX sales_items_vendor_id_idx ON public.sales_items USING btree (vendor_id) WHERE (vendor_id IS NOT NULL);

CREATE INDEX supplier_quote_files_quote_idx ON public.supplier_quote_files USING btree (supplier_quote_id);

CREATE INDEX supplier_quote_lines_quote_idx ON public.supplier_quote_lines USING btree (supplier_quote_id);

CREATE UNIQUE INDEX supplier_quotes_previous_unique ON public.supplier_quotes USING btree (previous_quote_id) WHERE (previous_quote_id IS NOT NULL);

CREATE INDEX supplier_quotes_requirement_idx ON public.supplier_quotes USING btree (requirement_id);

CREATE INDEX supplier_quotes_vendor_idx ON public.supplier_quotes USING btree (vendor_id);

CREATE INDEX trd_destination_idx ON public.travel_requirement_destinations USING btree (destination_id);

CREATE INDEX trd_requirement_idx ON public.travel_requirement_destinations USING btree (requirement_id, sequence_order);

CREATE INDEX travel_requirements_lead_idx ON public.travel_requirements USING btree (lead_id, created_at);

CREATE INDEX travel_requirements_status_idx ON public.travel_requirements USING btree (status);

CREATE INDEX vendor_payment_allocations_purchase_idx ON public.vendor_payment_allocations USING btree (purchase_id);

CREATE INDEX vendor_payments_account_idx ON public.vendor_payments USING btree (account_id);

CREATE INDEX vendor_payments_date_idx ON public.vendor_payments USING btree (payment_date);

CREATE INDEX vendor_payments_sale_idx ON public.vendor_payments USING btree (sale_id);

CREATE INDEX vendor_payments_vendor_idx ON public.vendor_payments USING btree (vendor_id);

CREATE INDEX vendors_active_idx ON public.vendors USING btree (is_active);

CREATE INDEX vendors_email_idx ON public.vendors USING btree (lower(email));

CREATE INDEX vendors_name_idx ON public.vendors USING btree (lower(name));

CREATE INDEX vendors_phone_idx ON public.vendors USING btree (phone);

CREATE OR REPLACE VIEW public.user_directory WITH (security_invoker=true) AS
 SELECT id,
    name
   FROM profiles p;

CREATE OR REPLACE FUNCTION public.cancel_invoice(_invoice_id uuid, _reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT app.is_admin(auth.uid()) OR NOT app.is_active_user(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: only Admin can cancel invoices';
  END IF;
  IF NULLIF(btrim(_reason), '') IS NULL THEN RAISE EXCEPTION 'A reason is required to cancel an invoice'; END IF;
  UPDATE public.invoices SET status = 'cancelled', cancel_reason = left(btrim(_reason), 500),
    cancelled_at = now(), cancelled_by = auth.uid()
    WHERE id = _invoice_id AND status = 'issued';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found or already cancelled'; END IF;
END; $function$
;

CREATE OR REPLACE FUNCTION public.convert_customer_quote_to_booking(_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _q public.customer_quotes; _req public.travel_requirements; _lead public.leads;
  _p public.customer_quote_pricing; _bp public.sale_pricing;
  _sale uuid; _destination uuid; _itinerary jsonb; _line record;
  _previous_flag text := COALESCE(current_setting('app.cq_conversion', true), '');
BEGIN
  IF auth.uid() IS NULL OR NOT app.is_active_user(auth.uid())
     OR NOT app.has_permission(auth.uid(), 'leads.manage') OR NOT app.has_permission(auth.uid(), 'sales.manage')
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','sales')) THEN
    RAISE EXCEPTION 'Forbidden: active Admin or Sales access is required';
  END IF;
  SELECT * INTO _q FROM public.customer_quotes WHERE id = _quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer quote not found'; END IF;
  IF _q.status <> 'accepted' THEN RAISE EXCEPTION 'Only an Accepted customer quote can be converted'; END IF;
  SELECT id INTO _sale FROM public.sales WHERE customer_quote_id = _q.id;
  IF FOUND THEN RETURN _sale; END IF;
  SELECT * INTO _req FROM public.travel_requirements WHERE id = _q.requirement_id FOR UPDATE;
  IF NOT FOUND OR _req.lead_id <> _q.lead_id THEN RAISE EXCEPTION 'Travel requirement not found for this quote'; END IF;
  SELECT * INTO _lead FROM public.leads WHERE id = _q.lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF _lead.status = 'lost' THEN RAISE EXCEPTION 'A Lost lead cannot be converted into a booking'; END IF;
  IF _lead.client_id <> _q.client_id THEN RAISE EXCEPTION 'The lead client no longer matches this quote'; END IF;
  IF _req.travel_start_date IS NOT NULL AND _req.travel_start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Travel date cannot be before the booking date';
  END IF;
  SELECT * INTO _p FROM public.customer_quote_pricing WHERE customer_quote_id = _q.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer quote pricing is missing'; END IF;
  PERFORM 1 FROM public.travel_requirement_destinations WHERE requirement_id = _req.id FOR SHARE;
  IF EXISTS (SELECT 1 FROM public.travel_requirement_destinations leg JOIN public.destinations d ON d.id = leg.destination_id
             WHERE leg.requirement_id = _req.id AND NOT d.is_active) THEN
    RAISE EXCEPTION 'A new booking requires active destinations';
  END IF;
  SELECT leg.destination_id INTO _destination FROM public.travel_requirement_destinations leg
    WHERE leg.requirement_id = _req.id ORDER BY leg.sequence_order, leg.id LIMIT 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('destination_id', leg.destination_id, 'name', d.name,
      'sequence_order', leg.sequence_order, 'nights', leg.nights) ORDER BY leg.sequence_order, leg.id), '[]'::jsonb)
    INTO _itinerary FROM public.travel_requirement_destinations leg JOIN public.destinations d ON d.id = leg.destination_id
    WHERE leg.requirement_id = _req.id;
  PERFORM set_config('app.cq_conversion', _q.id::text, true);
  INSERT INTO public.sales (client_id, destination_id, travel_date, notes, billing_type, customer_quote_id, quote_itinerary)
    VALUES (_q.client_id, _destination, _req.travel_start_date, _q.notes, _p.billing_type, _q.id, _itinerary)
    RETURNING id INTO _sale;
  FOR _line IN
    SELECT l.*, sq.vendor_id FROM public.customer_quote_lines l
      LEFT JOIN public.supplier_quote_lines sl ON sl.id = l.source_supplier_quote_line_id
      LEFT JOIN public.supplier_quotes sq ON sq.id = sl.supplier_quote_id
      WHERE l.customer_quote_id = _q.id ORDER BY l.sort_order, l.id
  LOOP
    INSERT INTO public.sales_items (sale_id, item_type, description, vendor_id, quantity, sort_order)
      VALUES (_sale, _line.purchase_type, _line.description, _line.vendor_id, _line.quantity, _line.sort_order);
    -- Snapshot is the whole line INR cost. Quantity 1 avoids loss from dividing/rounding unit costs.
    INSERT INTO public.sale_costs (sale_id, vendor_id, cost_type, description, quantity, unit_cost, currency_code, exchange_rate, sort_order)
      VALUES (_sale, _line.vendor_id, _line.purchase_type::text::public.sale_cost_type, _line.description,
              1, _line.expected_cost_inr, 'INR', 1, _line.sort_order);
  END LOOP;
  UPDATE public.sale_pricing SET markup_type = _p.markup_type, markup_value = _p.markup_value,
    discount_amount = _p.discount_amount, tcs_applicable = _p.tcs_applicable, tcs_rate = _p.tcs_rate
    WHERE sale_id = _sale RETURNING * INTO _bp;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking pricing is missing'; END IF;
  -- Existing triggers call app.calc_pricing. Reject the entire transaction if any copied amount differs.
  IF ROW(_bp.expected_cost, _bp.markup_amount, _bp.service_charge_amount, _bp.selling_value, _bp.gst_rate,
         _bp.gst_amount, _bp.tcs_rate, _bp.tcs_amount, _bp.customer_payable, _bp.expected_gross_profit)
     IS DISTINCT FROM ROW(_p.expected_cost, _p.markup_amount, _p.service_charge_amount, _p.selling_value, _p.gst_rate,
         _p.gst_amount, _p.tcs_rate, _p.tcs_amount, _p.customer_payable, _p.expected_gross_profit) THEN
    RAISE EXCEPTION 'Booking pricing does not match the Accepted quote; conversion was rolled back';
  END IF;
  -- Preserve the existing forward-only lead transitions instead of bypassing their guard.
  IF _lead.status IN ('new','in_progress') THEN
    UPDATE public.leads SET status = 'quoted' WHERE id = _lead.id;
  END IF;
  IF _lead.status <> 'won' THEN UPDATE public.leads SET status = 'won' WHERE id = _lead.id; END IF;
  PERFORM app.write_audit('customer_quote.converted', 'customer_quote', _q.id::text, NULL,
    jsonb_build_object('sale_id', _sale, 'quote_number', _q.quote_number));
  PERFORM app.write_audit('sale.from_customer_quote', 'sale', _sale::text, NULL,
    jsonb_build_object('customer_quote_id', _q.id, 'requirement_id', _req.id, 'itinerary', _itinerary));
  PERFORM set_config('app.cq_conversion', _previous_flag, true);
  RETURN _sale;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_customer_quote_revision(_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _old public.customer_quotes; _p public.customer_quote_pricing; _new uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT app.has_permission(auth.uid(), 'leads.manage') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Forbidden: this account is deactivated';
  END IF;
  SELECT * INTO _old FROM public.customer_quotes WHERE id = _quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer quote not found'; END IF;
  IF _old.status NOT IN ('sent','rejected','expired') THEN
    RAISE EXCEPTION 'Only a sent, rejected or expired quote can be revised';
  END IF;
  PERFORM set_config('app.cq_revision', 'on', true);
  INSERT INTO public.customer_quotes
    (quote_number, lead_id, requirement_id, client_id, valid_until, notes, created_by,
     revision_no, previous_quote_id,
     public_title, summary, itinerary, inclusions, exclusions, terms)
  VALUES ('pending', _old.lead_id, _old.requirement_id, _old.client_id, _old.valid_until,
     _old.notes, auth.uid(), _old.revision_no + 1, _old.id,
     _old.public_title, _old.summary, _old.itinerary, _old.inclusions, _old.exclusions, _old.terms)
  RETURNING id INTO _new;
  INSERT INTO public.customer_quote_lines
    (customer_quote_id, source_supplier_quote_line_id, purchase_type, description, quantity,
     currency, expected_cost_inr, sort_order)
  SELECT _new, source_supplier_quote_line_id, purchase_type, description, quantity,
     currency, expected_cost_inr, sort_order
  FROM public.customer_quote_lines WHERE customer_quote_id = _old.id;
  SELECT * INTO _p FROM public.customer_quote_pricing WHERE customer_quote_id = _old.id;
  UPDATE public.customer_quote_pricing SET
    billing_type = _p.billing_type, markup_type = _p.markup_type, markup_value = _p.markup_value,
    discount_amount = _p.discount_amount, tcs_applicable = _p.tcs_applicable, tcs_rate = _p.tcs_rate
   WHERE customer_quote_id = _new;
  UPDATE public.customer_quotes SET status = 'superseded' WHERE id = _old.id;
  PERFORM set_config('app.cq_revision', 'off', true);
  RETURN _new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_supplier_quote_revision(_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _old public.supplier_quotes; _new uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT app.has_permission(auth.uid(), 'leads.manage') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT * INTO _old FROM public.supplier_quotes WHERE id = _quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Supplier quote not found'; END IF;
  IF _old.status <> 'received' OR _old.is_superseded THEN
    RAISE EXCEPTION 'Only a current Received quote can be revised';
  END IF;
  PERFORM set_config('app.sq_revision', 'on', true);
  INSERT INTO public.supplier_quotes
    (quote_number, lead_id, requirement_id, vendor_id, valid_until, notes, created_by,
     revision_number, previous_quote_id, adults, children, child_ages, inclusions,
     exclusions, itinerary_notes)
  VALUES ('pending', _old.lead_id, _old.requirement_id, _old.vendor_id, _old.valid_until,
     _old.notes, auth.uid(), _old.revision_number + 1, _old.id, _old.adults, _old.children,
     _old.child_ages, _old.inclusions, _old.exclusions, _old.itinerary_notes)
  RETURNING id INTO _new;
  INSERT INTO public.supplier_quote_lines
    (supplier_quote_id, is_package, purchase_type, description, quantity, currency,
     unit_amount, exchange_rate, sort_order, price_basis, option_label, not_in_total)
  SELECT _new, is_package, purchase_type, description, quantity, currency,
     unit_amount, exchange_rate, sort_order, price_basis, option_label, not_in_total
  FROM public.supplier_quote_lines WHERE supplier_quote_id = _old.id;
  UPDATE public.supplier_quotes SET is_superseded = true WHERE id = _old.id;
  PERFORM set_config('app.sq_revision', 'off', true);
  RETURN _new;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_own_profile()
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _claims jsonb := COALESCE(auth.jwt(), '{}'::jsonb);
  _email text;
  _name text;
  _row public.profiles;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _row FROM public.profiles WHERE id = _uid;
  IF FOUND THEN
    RETURN _row;
  END IF;

  _email := COALESCE(_claims->>'email', '');
  _name := COALESCE(
    NULLIF(_claims->'user_metadata'->>'name', ''),
    NULLIF(split_part(_email, '@', 1), ''),
    ''
  );

  INSERT INTO public.profiles (id, email, name)
  VALUES (_uid, _email, _name)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO _row FROM public.profiles WHERE id = _uid;
  RETURN _row;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_shared_customer_quote(_token text, _track boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _q public.customer_quotes; _r public.travel_requirements; _p public.customer_quote_pricing;
  _client text; _dest jsonb; _latest boolean;
BEGIN
  IF _token IS NULL OR char_length(_token) < 32 OR char_length(_token) > 128 THEN RETURN NULL; END IF;
  SELECT * INTO _q FROM public.customer_quotes WHERE share_token = _token AND share_enabled;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF _track THEN
    PERFORM set_config('app.cq_view', 'on', true);
    UPDATE public.customer_quotes SET view_count = view_count + 1, last_viewed_at = now()
     WHERE id = _q.id;
    PERFORM set_config('app.cq_view', 'off', true);
  END IF;
  SELECT * INTO _r FROM public.travel_requirements WHERE id = _q.requirement_id;
  SELECT * INTO _p FROM public.customer_quote_pricing WHERE customer_quote_id = _q.id;
  SELECT name INTO _client FROM public.clients WHERE id = _q.client_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', d.name, 'country', d.country, 'nights', trd.nights)
           ORDER BY trd.sequence_order), '[]'::jsonb)
    INTO _dest
    FROM public.travel_requirement_destinations trd
    JOIN public.destinations d ON d.id = trd.destination_id
   WHERE trd.requirement_id = _q.requirement_id;
  _latest := NOT EXISTS (SELECT 1 FROM public.customer_quotes WHERE previous_quote_id = _q.id);
  RETURN jsonb_build_object(
    'quote_number', _q.quote_number,
    'revision_no', _q.revision_no,
    'status', _q.status,
    'is_latest', _latest AND _q.status <> 'superseded',
    'client_name', _client,
    'destinations', _dest,
    'travel_start_date', _r.travel_start_date,
    'travel_end_date', _r.travel_end_date,
    'adults', _r.adults,
    'children', _r.children,
    'public_title', _q.public_title,
    'summary', _q.summary,
    'itinerary', _q.itinerary,
    'inclusions', _q.inclusions,
    'exclusions', _q.exclusions,
    'terms', _q.terms,
    'valid_until', _q.valid_until,
    'total', ((COALESCE(_p.customer_payable, 0) - COALESCE(_p.gst_amount, 0) - COALESCE(_p.tcs_amount, 0)))::text,
    'gst_rate', COALESCE(_p.gst_rate, 0)::text,
    'gst_amount', COALESCE(_p.gst_amount, 0)::text,
    'tcs_rate', _p.tcs_rate::text,
    'tcs_amount', COALESCE(_p.tcs_amount, 0)::text,
    'customer_payable', COALESCE(_p.customer_payable, 0)::text
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.import_clients(_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _n integer;
BEGIN
  IF NOT (app.has_role(_uid, 'admin') OR app.has_role(_uid, 'sales') OR app.has_role(_uid, 'operations')) THEN
    RAISE EXCEPTION 'Forbidden: you cannot import clients';
  END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) > 500 THEN
    RAISE EXCEPTION 'Up to 500 rows can be imported at once';
  END IF;
  PERFORM set_config('app.import_source', 'CSV import', true);
  INSERT INTO public.clients (name, phone, email, city, state, gst_number, source, referred_by, notes, is_active, created_by)
  SELECT btrim(r.name), NULLIF(btrim(r.phone),''), NULLIF(btrim(r.email),''), NULLIF(btrim(r.city),''),
         NULLIF(btrim(r.state),''), NULLIF(upper(btrim(r.gstin)),''), NULLIF(btrim(r.source),''),
         CASE WHEN r.source = 'Referral' THEN NULLIF(btrim(r.referred_by),'') END,
         NULLIF(btrim(r.notes),''), true, _uid
  FROM jsonb_to_recordset(_rows) AS r(name text, phone text, email text, city text, state text,
    gstin text, source text, referred_by text, notes text);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM set_config('app.import_source', '', true);
  RETURN _n;
END; $function$
;

CREATE OR REPLACE FUNCTION public.import_vendors(_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _n integer;
BEGIN
  IF NOT (app.has_role(_uid, 'admin') OR app.has_role(_uid, 'operations')) THEN
    RAISE EXCEPTION 'Forbidden: you cannot import vendors';
  END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) > 500 THEN
    RAISE EXCEPTION 'Up to 500 rows can be imported at once';
  END IF;
  PERFORM set_config('app.import_source', 'CSV import', true);
  INSERT INTO public.vendors (name, phone, email, city, gst_number, payment_terms, notes, is_active, created_by)
  SELECT btrim(r.name), NULLIF(btrim(r.phone),''), NULLIF(btrim(r.email),''), NULLIF(btrim(r.city),''),
         NULLIF(upper(btrim(r.gstin)),''), NULLIF(btrim(r.payment_terms),''), NULLIF(btrim(r.notes),''), true, _uid
  FROM jsonb_to_recordset(_rows) AS r(name text, phone text, email text, city text, gstin text,
    payment_terms text, notes text);
  GET DIAGNOSTICS _n = ROW_COUNT;
  PERFORM set_config('app.import_source', '', true);
  RETURN _n;
END; $function$
;

CREATE OR REPLACE FUNCTION public.issue_invoice(_sale_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _sale record; _pricing record; _client record; _co record;
  _dest text; _title text; _adults int; _children int; _end date;
  _today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  _fy_start int; _fy text; _seq int; _number text;
  _received numeric; _taxable numeric; _cgst numeric := 0; _sgst numeric := 0; _igst numeric := 0;
  _supply text; _intra boolean; _id uuid;
BEGIN
  IF NOT (app.has_role(_uid, 'admin') OR app.has_role(_uid, 'accounts')) THEN
    RAISE EXCEPTION 'Forbidden: only Admin or Accounts can issue invoices';
  END IF;
  SELECT * INTO _sale FROM public.sales WHERE id = _sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF _sale.status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled bookings cannot be invoiced'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE sale_id = _sale_id AND status = 'issued') THEN
    RAISE EXCEPTION 'This booking already has an active invoice';
  END IF;
  SELECT * INTO _pricing FROM public.sale_pricing WHERE sale_id = _sale_id;
  IF NOT FOUND OR COALESCE(_pricing.customer_payable, 0) <= 0 THEN
    RAISE EXCEPTION 'The booking has no customer payable';
  END IF;
  SELECT * INTO _co FROM public.company_settings WHERE id = true;
  IF _co.legal_name IS NULL OR _co.gstin IS NULL OR _co.address IS NULL OR _co.state IS NULL THEN
    RAISE EXCEPTION 'Complete the company settings (legal name, GSTIN, address, state) first';
  END IF;
  SELECT * INTO _client FROM public.clients WHERE id = _sale.client_id;
  SELECT name INTO _dest FROM public.destinations WHERE id = _sale.destination_id;
  IF _sale.customer_quote_id IS NOT NULL THEN
    SELECT NULLIF(btrim(q.public_title), ''), r.adults, r.children, r.travel_end_date
      INTO _title, _adults, _children, _end
      FROM public.customer_quotes q JOIN public.travel_requirements r ON r.id = q.requirement_id
      WHERE q.id = _sale.customer_quote_id;
  END IF;
  _title := COALESCE(_title, 'Tour package: ' || COALESCE(_dest, 'as booked'));

  _fy_start := CASE WHEN extract(month FROM _today) >= 4 THEN extract(year FROM _today)::int
                    ELSE extract(year FROM _today)::int - 1 END;
  _fy := _fy_start::text || '-' || lpad(((_fy_start + 1) % 100)::text, 2, '0');
  INSERT INTO public.invoice_counters (financial_year, last_number) VALUES (_fy, 1)
    ON CONFLICT (financial_year) DO UPDATE SET last_number = public.invoice_counters.last_number + 1
    RETURNING last_number INTO _seq;
  _number := _co.invoice_prefix || '/' || _fy || '/' || lpad(_seq::text, 4, '0');

  SELECT COALESCE(sum(amount_inr), 0) INTO _received FROM public.customer_receipts
    WHERE sale_id = _sale_id AND status = 'recorded';
  _taxable := _pricing.customer_payable - _pricing.gst_amount - _pricing.tcs_amount;
  _supply := NULLIF(btrim(_client.state), '');
  _intra := _supply IS NOT NULL AND lower(_supply) = lower(btrim(_co.state));
  IF _intra THEN
    _cgst := round(_pricing.gst_amount / 2, 2);
    _sgst := _pricing.gst_amount - _cgst;
  ELSE
    _igst := _pricing.gst_amount;
  END IF;

  INSERT INTO public.invoices (invoice_number, financial_year, sequence_no, sale_id, client_id,
    invoice_date, client_name, total_payable, snapshot, created_by)
  VALUES (_number, _fy, _seq, _sale_id, _sale.client_id, _today, _client.name, _pricing.customer_payable,
    jsonb_build_object(
      'company', jsonb_build_object('legal_name', _co.legal_name, 'trade_name', _co.trade_name,
        'gstin', _co.gstin, 'address', _co.address, 'state', _co.state, 'phone', _co.phone,
        'email', _co.email, 'bank_name', _co.bank_name, 'bank_account_name', _co.bank_account_name,
        'bank_account_number', _co.bank_account_number, 'bank_ifsc', _co.bank_ifsc,
        'upi_id', _co.upi_id, 'logo_path', _co.logo_path),
      'client', jsonb_build_object('name', _client.name, 'address', _client.address,
        'gstin', _client.gst_number, 'state', _supply),
      'booking_number', _sale.booking_number,
      'destination', _dest,
      'travel_start', _sale.travel_date,
      'travel_end', _end,
      'adults', _adults, 'children', _children,
      'description', _title,
      'taxable_value', _taxable::text,
      'gst_rate', _pricing.gst_rate::text,
      'gst_amount', _pricing.gst_amount::text,
      'tax_mode', CASE WHEN _intra THEN 'cgst_sgst' ELSE 'igst' END,
      'place_of_supply', _supply,
      'cgst', _cgst::text, 'sgst', _sgst::text, 'igst', _igst::text,
      'tcs_rate', _pricing.tcs_rate::text,
      'tcs_amount', _pricing.tcs_amount::text,
      'total_payable', _pricing.customer_payable::text,
      'amount_received', _received::text,
      'balance_due', GREATEST(_pricing.customer_payable - _received, 0)::text),
    _uid)
  RETURNING id INTO _id;
  RETURN _id;
END; $function$
;

CREATE OR REPLACE FUNCTION public.link_receipt_allocations(_receipt_id uuid, _allocations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE _a record;
BEGIN
  DELETE FROM public.customer_receipt_allocations WHERE receipt_id = _receipt_id;
  FOR _a IN SELECT * FROM jsonb_to_recordset(COALESCE(_allocations,'[]'::jsonb)) AS x(sale_id uuid, amount_inr numeric) LOOP
    IF _a.amount_inr IS NOT NULL AND _a.amount_inr > 0 THEN
      INSERT INTO public.customer_receipt_allocations (receipt_id, sale_id, amount_inr)
      VALUES (_receipt_id, _a.sale_id, _a.amount_inr);
    END IF;
  END LOOP;
END; $function$
;

CREATE OR REPLACE FUNCTION public.list_selectable_accounts()
 RETURNS TABLE(id uuid, name text, account_type text, last4 text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.id, a.name, a.account_type, a.last4 FROM public.accounts a
  WHERE a.is_active AND (
    app.has_permission(auth.uid(), 'accounts.read') OR app.has_permission(auth.uid(), 'payments.manage')
    OR app.has_permission(auth.uid(), 'payments.enter') OR app.has_permission(auth.uid(), 'receipts.manage')
    OR app.has_permission(auth.uid(), 'receipts.enter_own'))
  ORDER BY lower(a.name);
$function$
;

CREATE OR REPLACE FUNCTION public.my_last_account()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT x.account_id FROM (
    SELECT account_id, created_at FROM public.vendor_payments WHERE created_by = auth.uid()
    UNION ALL SELECT account_id, created_at FROM public.customer_receipts WHERE created_by = auth.uid()
    UNION ALL SELECT account_id, created_at FROM public.other_transactions WHERE created_by = auth.uid()
  ) x JOIN public.accounts a ON a.id = x.account_id AND a.is_active
  ORDER BY x.created_at DESC LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.save_vendor_payment(_id uuid, _values jsonb, _allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE _row public.vendor_payments; _a record;
BEGIN
  IF _id IS NULL THEN
    INSERT INTO public.vendor_payments (vendor_id, sale_id, account_id, payment_type, payment_date, amount_inr, method, reference, notes)
    VALUES ((_values->>'vendor_id')::uuid, NULLIF(_values->>'sale_id','')::uuid,
      (_values->>'account_id')::uuid,
      COALESCE(_values->>'payment_type','part'), COALESCE(NULLIF(_values->>'payment_date','')::date, current_date),
      (_values->>'amount_inr')::numeric, _values->>'method', _values->>'reference', _values->>'notes')
    RETURNING * INTO _row;
  ELSE
    DELETE FROM public.vendor_payment_allocations WHERE payment_id = _id;
    UPDATE public.vendor_payments SET
      vendor_id = (_values->>'vendor_id')::uuid,
      sale_id = NULLIF(_values->>'sale_id','')::uuid,
      account_id = COALESCE(NULLIF(_values->>'account_id','')::uuid, account_id),
      payment_type = COALESCE(_values->>'payment_type','part'),
      payment_date = COALESCE(NULLIF(_values->>'payment_date','')::date, payment_date),
      amount_inr = (_values->>'amount_inr')::numeric,
      method = _values->>'method',
      reference = _values->>'reference',
      notes = _values->>'notes'
    WHERE id = _id RETURNING * INTO _row;
    IF _row.id IS NULL THEN RAISE EXCEPTION 'Payment not found or not editable'; END IF;
  END IF;
  FOR _a IN SELECT * FROM jsonb_to_recordset(COALESCE(_allocations,'[]'::jsonb)) AS x(purchase_id uuid, amount_inr numeric) LOOP
    IF _a.amount_inr IS NOT NULL AND _a.amount_inr > 0 THEN
      INSERT INTO public.vendor_payment_allocations (payment_id, purchase_id, amount_inr)
      VALUES (_row.id, _a.purchase_id, _a.amount_inr);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('id', _row.id, 'payment_number', _row.payment_number);
END; $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE TRIGGER accounts_a_guard BEFORE INSERT OR UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION app.guard_account();

CREATE TRIGGER accounts_audit AFTER INSERT OR UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('account');

CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER app_settings_audit AFTER UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('app_settings');

CREATE TRIGGER app_settings_set_updated_at BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER clients_audit_insert AFTER INSERT ON clients FOR EACH ROW EXECUTE FUNCTION app.audit_master_insert('client');

CREATE TRIGGER clients_audit_update AFTER UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION app.audit_master_update('client');

CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER company_settings_audit AFTER UPDATE ON company_settings FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('company_settings');

CREATE TRIGGER company_settings_set_updated_at BEFORE UPDATE ON company_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER customer_quote_lines_audit AFTER INSERT OR DELETE OR UPDATE ON customer_quote_lines FOR EACH ROW EXECUTE FUNCTION app.audit_customer_quote_line();

CREATE TRIGGER customer_quote_lines_guard BEFORE INSERT OR DELETE OR UPDATE ON customer_quote_lines FOR EACH ROW EXECUTE FUNCTION app.guard_customer_quote_line();

CREATE TRIGGER customer_quote_lines_set_updated_at BEFORE UPDATE ON customer_quote_lines FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER customer_quote_lines_sync_pricing AFTER INSERT OR DELETE OR UPDATE ON customer_quote_lines FOR EACH ROW EXECUTE FUNCTION app.sync_customer_quote_pricing();

CREATE TRIGGER customer_quote_pricing_audit AFTER UPDATE ON customer_quote_pricing FOR EACH ROW EXECUTE FUNCTION app.audit_customer_quote_pricing();

CREATE TRIGGER customer_quote_pricing_compute BEFORE INSERT OR UPDATE ON customer_quote_pricing FOR EACH ROW EXECUTE FUNCTION app.compute_customer_quote_pricing();

CREATE TRIGGER customer_quote_pricing_set_updated_at BEFORE UPDATE ON customer_quote_pricing FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER customer_quotes_audit AFTER INSERT OR UPDATE ON customer_quotes FOR EACH ROW EXECUTE FUNCTION app.audit_customer_quote();

CREATE TRIGGER customer_quotes_create_pricing AFTER INSERT ON customer_quotes FOR EACH ROW EXECUTE FUNCTION app.create_customer_quote_pricing();

CREATE TRIGGER customer_quotes_guard_insert BEFORE INSERT ON customer_quotes FOR EACH ROW EXECUTE FUNCTION app.guard_customer_quote_insert();

CREATE TRIGGER customer_quotes_guard_insert_share BEFORE INSERT ON customer_quotes FOR EACH ROW EXECUTE FUNCTION app.guard_customer_quote_insert_share();

CREATE TRIGGER customer_quotes_guard_update BEFORE UPDATE ON customer_quotes FOR EACH ROW EXECUTE FUNCTION app.guard_customer_quote_update();

CREATE TRIGGER customer_quotes_set_updated_at BEFORE UPDATE ON customer_quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER cra_a_guard BEFORE INSERT ON customer_receipt_allocations FOR EACH ROW EXECUTE FUNCTION app.guard_customer_receipt_allocation();

CREATE TRIGGER cra_audit AFTER INSERT OR DELETE ON customer_receipt_allocations FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('customer_receipt_allocation');

CREATE TRIGGER customer_receipts_a_guard_insert BEFORE INSERT ON customer_receipts FOR EACH ROW EXECUTE FUNCTION app.guard_customer_receipt_insert();

CREATE TRIGGER customer_receipts_a_guard_update BEFORE UPDATE ON customer_receipts FOR EACH ROW EXECUTE FUNCTION app.guard_customer_receipt_update();

CREATE TRIGGER customer_receipts_audit AFTER INSERT OR UPDATE ON customer_receipts FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('customer_receipt');

CREATE TRIGGER customer_receipts_b_account BEFORE INSERT OR UPDATE ON customer_receipts FOR EACH ROW EXECUTE FUNCTION app.guard_money_account();

CREATE TRIGGER customer_receipts_set_updated_at BEFORE UPDATE ON customer_receipts FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER destinations_audit_insert AFTER INSERT ON destinations FOR EACH ROW EXECUTE FUNCTION app.audit_master_insert('destination');

CREATE TRIGGER destinations_audit_update AFTER UPDATE ON destinations FOR EACH ROW EXECUTE FUNCTION app.audit_master_update('destination');

CREATE TRIGGER destinations_set_updated_at BEFORE UPDATE ON destinations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER invoices_audit AFTER INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('invoice');

CREATE TRIGGER invoices_block_delete BEFORE DELETE ON invoices FOR EACH ROW EXECUTE FUNCTION app.block_invoice_delete();

CREATE TRIGGER invoices_guard_update BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION app.guard_invoice_update();

CREATE TRIGGER leads_audit_insert AFTER INSERT ON leads FOR EACH ROW EXECUTE FUNCTION app.audit_lead_insert();

CREATE TRIGGER leads_audit_update AFTER UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION app.audit_lead_update();

CREATE TRIGGER leads_guard_insert BEFORE INSERT ON leads FOR EACH ROW EXECUTE FUNCTION app.guard_lead_insert();

CREATE TRIGGER leads_guard_update BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION app.guard_lead_update();

CREATE TRIGGER leads_set_updated_at BEFORE UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER other_transactions_a_guard BEFORE INSERT OR UPDATE ON other_transactions FOR EACH ROW EXECUTE FUNCTION app.guard_other_transaction();

CREATE TRIGGER other_transactions_audit AFTER INSERT OR UPDATE ON other_transactions FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('other_transaction');

CREATE TRIGGER other_transactions_set_updated_at BEFORE UPDATE ON other_transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER profiles_audit_insert AFTER INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION app.audit_profile_insert();

CREATE TRIGGER profiles_audit_update AFTER UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION app.audit_profile_update();

CREATE TRIGGER profiles_guard_update BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION app.guard_profile_update();

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER purchases_a_guard_insert BEFORE INSERT ON purchases FOR EACH ROW EXECUTE FUNCTION app.guard_purchase_insert();

CREATE TRIGGER purchases_a_guard_update BEFORE UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION app.guard_purchase_update();

CREATE TRIGGER purchases_audit_insert AFTER INSERT ON purchases FOR EACH ROW EXECUTE FUNCTION app.audit_purchase_insert();

CREATE TRIGGER purchases_audit_update AFTER UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION app.audit_purchase_update();

CREATE TRIGGER purchases_b_compute BEFORE INSERT OR UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION app.compute_purchase();

CREATE TRIGGER purchases_c_allocation_guard BEFORE UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION app.guard_purchase_allocations();

CREATE TRIGGER purchases_set_updated_at BEFORE UPDATE ON purchases FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER sale_costs_audit_delete AFTER DELETE ON sale_costs FOR EACH ROW EXECUTE FUNCTION app.audit_sale_cost_delete();

CREATE TRIGGER sale_costs_audit_insert AFTER INSERT ON sale_costs FOR EACH ROW EXECUTE FUNCTION app.audit_sale_cost_insert();

CREATE TRIGGER sale_costs_audit_update AFTER UPDATE ON sale_costs FOR EACH ROW EXECUTE FUNCTION app.audit_sale_cost_update();

CREATE TRIGGER sale_costs_compute BEFORE INSERT OR UPDATE ON sale_costs FOR EACH ROW EXECUTE FUNCTION app.compute_sale_cost();

CREATE TRIGGER sale_costs_guard_delete BEFORE DELETE ON sale_costs FOR EACH ROW EXECUTE FUNCTION app.guard_sale_cost_delete();

CREATE TRIGGER sale_costs_guard_insert BEFORE INSERT ON sale_costs FOR EACH ROW EXECUTE FUNCTION app.guard_sale_cost_insert();

CREATE TRIGGER sale_costs_guard_update BEFORE UPDATE ON sale_costs FOR EACH ROW EXECUTE FUNCTION app.guard_sale_cost_update();

CREATE TRIGGER sale_costs_set_updated_at BEFORE UPDATE ON sale_costs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER sale_costs_sync_pricing AFTER INSERT OR DELETE OR UPDATE ON sale_costs FOR EACH ROW EXECUTE FUNCTION app.sync_sale_pricing();

CREATE TRIGGER sale_pricing_audit_update AFTER UPDATE ON sale_pricing FOR EACH ROW EXECUTE FUNCTION app.audit_sale_pricing_update();

CREATE TRIGGER sale_pricing_compute BEFORE INSERT OR UPDATE ON sale_pricing FOR EACH ROW EXECUTE FUNCTION app.compute_sale_pricing();

CREATE TRIGGER sale_pricing_guard_update BEFORE UPDATE ON sale_pricing FOR EACH ROW EXECUTE FUNCTION app.guard_sale_pricing_update();

CREATE TRIGGER sale_pricing_set_updated_at BEFORE UPDATE ON sale_pricing FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER sales_assign_booking_number BEFORE INSERT ON sales FOR EACH ROW EXECUTE FUNCTION app.assign_booking_number();

CREATE TRIGGER sales_audit_insert AFTER INSERT ON sales FOR EACH ROW EXECUTE FUNCTION app.audit_sale_insert();

CREATE TRIGGER sales_audit_update AFTER UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION app.audit_sale_update();

CREATE TRIGGER sales_billing_type_recalc AFTER UPDATE OF billing_type ON sales FOR EACH ROW WHEN (new.billing_type IS DISTINCT FROM old.billing_type) EXECUTE FUNCTION app.sync_sale_pricing_on_sale();

CREATE TRIGGER sales_create_pricing AFTER INSERT ON sales FOR EACH ROW EXECUTE FUNCTION app.sync_sale_pricing_on_sale();

CREATE TRIGGER sales_guard_booking_number BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION app.guard_sale_booking_number();

CREATE TRIGGER sales_guard_insert BEFORE INSERT ON sales FOR EACH ROW EXECUTE FUNCTION app.guard_sale_insert();

CREATE TRIGGER sales_guard_quote_link BEFORE INSERT OR UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION app.guard_sale_quote_link();

CREATE TRIGGER sales_guard_update BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION app.guard_sale_update();

CREATE TRIGGER sales_set_updated_at BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER sales_items_audit_delete AFTER DELETE ON sales_items FOR EACH ROW EXECUTE FUNCTION app.audit_sale_item_delete();

CREATE TRIGGER sales_items_audit_insert AFTER INSERT ON sales_items FOR EACH ROW EXECUTE FUNCTION app.audit_sale_item_insert();

CREATE TRIGGER sales_items_audit_update AFTER UPDATE ON sales_items FOR EACH ROW EXECUTE FUNCTION app.audit_sale_item_update();

CREATE TRIGGER sales_items_guard_delete BEFORE DELETE ON sales_items FOR EACH ROW EXECUTE FUNCTION app.guard_sale_item_delete();

CREATE TRIGGER sales_items_guard_insert BEFORE INSERT ON sales_items FOR EACH ROW EXECUTE FUNCTION app.guard_sale_item_insert();

CREATE TRIGGER sales_items_guard_update BEFORE UPDATE ON sales_items FOR EACH ROW EXECUTE FUNCTION app.guard_sale_item_update();

CREATE TRIGGER sales_items_set_updated_at BEFORE UPDATE ON sales_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER supplier_quote_files_audit AFTER INSERT ON supplier_quote_files FOR EACH ROW EXECUTE FUNCTION app.audit_supplier_quote_file();

CREATE TRIGGER supplier_quote_files_guard BEFORE INSERT OR DELETE OR UPDATE ON supplier_quote_files FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_quote_file();

CREATE TRIGGER supplier_quote_lines_audit AFTER INSERT OR DELETE OR UPDATE ON supplier_quote_lines FOR EACH ROW EXECUTE FUNCTION app.audit_supplier_quote_line();

CREATE TRIGGER supplier_quote_lines_guard BEFORE INSERT OR DELETE OR UPDATE ON supplier_quote_lines FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_quote_line();

CREATE TRIGGER supplier_quote_lines_set_updated_at BEFORE UPDATE ON supplier_quote_lines FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER supplier_quotes_audit AFTER INSERT OR UPDATE ON supplier_quotes FOR EACH ROW EXECUTE FUNCTION app.audit_supplier_quote();

CREATE TRIGGER supplier_quotes_guard_insert BEFORE INSERT ON supplier_quotes FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_quote_insert();

CREATE TRIGGER supplier_quotes_guard_update BEFORE UPDATE ON supplier_quotes FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_quote_update();

CREATE TRIGGER supplier_quotes_set_updated_at BEFORE UPDATE ON supplier_quotes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trd_guard BEFORE INSERT OR DELETE OR UPDATE ON travel_requirement_destinations FOR EACH ROW EXECUTE FUNCTION app.guard_requirement_destination();

CREATE TRIGGER travel_requirements_audit_insert AFTER INSERT ON travel_requirements FOR EACH ROW EXECUTE FUNCTION app.audit_requirement_insert();

CREATE TRIGGER travel_requirements_audit_update AFTER UPDATE ON travel_requirements FOR EACH ROW EXECUTE FUNCTION app.audit_requirement_update();

CREATE TRIGGER travel_requirements_guard_insert BEFORE INSERT ON travel_requirements FOR EACH ROW EXECUTE FUNCTION app.guard_requirement_insert();

CREATE TRIGGER travel_requirements_guard_update BEFORE UPDATE ON travel_requirements FOR EACH ROW EXECUTE FUNCTION app.guard_requirement_update();

CREATE TRIGGER travel_requirements_set_updated_at BEFORE UPDATE ON travel_requirements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER user_roles_audit_delete AFTER DELETE ON user_roles FOR EACH ROW EXECUTE FUNCTION app.audit_role_removed();

CREATE TRIGGER user_roles_audit_insert AFTER INSERT ON user_roles FOR EACH ROW EXECUTE FUNCTION app.audit_role_assigned();

CREATE TRIGGER user_roles_guard_delete BEFORE DELETE ON user_roles FOR EACH ROW EXECUTE FUNCTION app.guard_role_delete();

CREATE TRIGGER vpa_a_guard BEFORE INSERT OR UPDATE ON vendor_payment_allocations FOR EACH ROW EXECUTE FUNCTION app.guard_vendor_payment_allocation();

CREATE TRIGGER vpa_audit AFTER INSERT OR DELETE OR UPDATE ON vendor_payment_allocations FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('vendor_payment_allocation');

CREATE TRIGGER vpa_set_updated_at BEFORE UPDATE ON vendor_payment_allocations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER vendor_payments_a_guard_insert BEFORE INSERT ON vendor_payments FOR EACH ROW EXECUTE FUNCTION app.guard_vendor_payment_insert();

CREATE TRIGGER vendor_payments_a_guard_update BEFORE UPDATE ON vendor_payments FOR EACH ROW EXECUTE FUNCTION app.guard_vendor_payment_update();

CREATE TRIGGER vendor_payments_audit AFTER INSERT OR UPDATE ON vendor_payments FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('vendor_payment');

CREATE TRIGGER vendor_payments_b_account BEFORE INSERT OR UPDATE ON vendor_payments FOR EACH ROW EXECUTE FUNCTION app.guard_money_account();

CREATE TRIGGER vendor_payments_set_updated_at BEFORE UPDATE ON vendor_payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER vendors_audit_insert AFTER INSERT ON vendors FOR EACH ROW EXECUTE FUNCTION app.audit_master_insert('vendor');

CREATE TRIGGER vendors_audit_update AFTER UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION app.audit_master_update('vendor');

CREATE TRIGGER vendors_set_updated_at BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_quote_lines ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_quote_pricing ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_quotes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_receipt_allocations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_receipts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.other_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sale_costs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sale_pricing ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sales_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.supplier_quote_files ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.supplier_quote_lines ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.supplier_quotes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.travel_requirement_destinations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.travel_requirements ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_payment_allocations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendor_payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY accounts_insert ON public.accounts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'accounts.manage'::text));

CREATE POLICY accounts_select ON public.accounts AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'accounts.read'::text));

CREATE POLICY accounts_update ON public.accounts AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'accounts.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'accounts.manage'::text));

CREATE POLICY app_settings_select_signed_in ON public.app_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY app_settings_update_admin ON public.app_settings AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.is_admin(auth.uid()))
  WITH CHECK (app.is_admin(auth.uid()));

CREATE POLICY audit_log_select_admin ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'audit.read'::text));

CREATE POLICY clients_insert_manage ON public.clients AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'clients.manage'::text));

CREATE POLICY clients_select_read_permission ON public.clients AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'clients.read'::text));

CREATE POLICY clients_update_manage ON public.clients AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'clients.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'clients.manage'::text));

CREATE POLICY company_settings_select ON public.company_settings AS PERMISSIVE FOR SELECT TO authenticated
  USING (true);

CREATE POLICY company_settings_update_admin ON public.company_settings AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.is_admin(auth.uid()))
  WITH CHECK (app.is_admin(auth.uid()));

CREATE POLICY cql_delete_manage ON public.customer_quote_lines AS PERMISSIVE FOR DELETE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY cql_insert_manage ON public.customer_quote_lines AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY cql_select_read ON public.customer_quote_lines AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.read'::text));

CREATE POLICY cql_update_manage ON public.customer_quote_lines AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY cqp_select_read ON public.customer_quote_pricing AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.read'::text));

CREATE POLICY cqp_update_manage ON public.customer_quote_pricing AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY customer_quotes_insert_manage ON public.customer_quotes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((app.has_permission(auth.uid(), 'leads.manage'::text) AND (created_by = auth.uid())));

CREATE POLICY customer_quotes_select_read ON public.customer_quotes AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.read'::text));

CREATE POLICY customer_quotes_update_manage ON public.customer_quotes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY cra_delete ON public.customer_receipt_allocations AS PERMISSIVE FOR DELETE TO authenticated
  USING ((app.has_permission(auth.uid(), 'receipts.manage'::text) AND app.customer_receipt_is_recorded(receipt_id)));

CREATE POLICY cra_insert ON public.customer_receipt_allocations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((app.has_permission(auth.uid(), 'receipts.manage'::text) AND app.customer_receipt_is_recorded(receipt_id)));

CREATE POLICY cra_select ON public.customer_receipt_allocations AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'receipts.read'::text));

CREATE POLICY customer_receipts_insert ON public.customer_receipts AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((app.has_permission(auth.uid(), 'receipts.manage'::text) OR app.has_permission(auth.uid(), 'receipts.enter_own'::text)));

CREATE POLICY customer_receipts_select ON public.customer_receipts AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'receipts.read'::text));

CREATE POLICY customer_receipts_update ON public.customer_receipts AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'receipts.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'receipts.manage'::text));

CREATE POLICY destinations_insert_manage ON public.destinations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'destinations.manage'::text));

CREATE POLICY destinations_select_read_permission ON public.destinations AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'destinations.read'::text));

CREATE POLICY destinations_update_manage ON public.destinations AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'destinations.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'destinations.manage'::text));

CREATE POLICY invoices_select ON public.invoices AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.can_read_invoices(auth.uid()));

CREATE POLICY leads_insert_manage ON public.leads AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((app.has_permission(auth.uid(), 'leads.manage'::text) AND (created_by = auth.uid())));

CREATE POLICY leads_select_read_permission ON public.leads AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.read'::text));

CREATE POLICY leads_update_manage ON public.leads AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY other_transactions_insert ON public.other_transactions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'accounts.manage'::text));

CREATE POLICY other_transactions_select ON public.other_transactions AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'accounts.read'::text));

CREATE POLICY other_transactions_update ON public.other_transactions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'accounts.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'accounts.manage'::text));

CREATE POLICY permissions_select_active ON public.permissions AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.is_active_user(auth.uid()));

CREATE POLICY profiles_delete_admin ON public.profiles AS PERMISSIVE FOR DELETE TO authenticated
  USING (app.is_admin(auth.uid()));

CREATE POLICY profiles_insert_admin ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (app.is_admin(auth.uid()));

CREATE POLICY profiles_select_directory ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.is_active_user(auth.uid()));

CREATE POLICY profiles_select_own ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated
  USING (((id = auth.uid()) OR app.is_admin(auth.uid())));

CREATE POLICY profiles_update_own_or_admin ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((((id = auth.uid()) AND app.is_active_user(auth.uid())) OR app.is_admin(auth.uid())))
  WITH CHECK ((((id = auth.uid()) AND app.is_active_user(auth.uid())) OR app.is_admin(auth.uid())));

CREATE POLICY purchases_insert ON public.purchases AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((app.has_permission(auth.uid(), 'purchases.manage'::text) AND app.sale_accepts_purchases(sale_id)));

CREATE POLICY purchases_select ON public.purchases AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'purchases.read'::text));

CREATE POLICY purchases_update ON public.purchases AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((app.has_permission(auth.uid(), 'purchases.manage'::text) AND app.sale_accepts_purchases(sale_id)))
  WITH CHECK ((app.has_permission(auth.uid(), 'purchases.manage'::text) AND app.sale_accepts_purchases(sale_id)));

CREATE POLICY role_permissions_select_active ON public.role_permissions AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.is_active_user(auth.uid()));

CREATE POLICY sale_costs_delete ON public.sale_costs AS PERMISSIVE FOR DELETE TO authenticated
  USING ((app.has_permission(auth.uid(), 'sales.manage'::text) AND app.sale_is_editable(sale_id)));

CREATE POLICY sale_costs_insert ON public.sale_costs AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((app.has_permission(auth.uid(), 'sales.manage'::text) AND app.sale_is_editable(sale_id)));

CREATE POLICY sale_costs_select ON public.sale_costs AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.read'::text));

CREATE POLICY sale_costs_update ON public.sale_costs AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((app.has_permission(auth.uid(), 'sales.manage'::text) AND app.sale_is_editable(sale_id)))
  WITH CHECK ((app.has_permission(auth.uid(), 'sales.manage'::text) AND app.sale_is_editable(sale_id)));

CREATE POLICY sale_pricing_select ON public.sale_pricing AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.read'::text));

CREATE POLICY sale_pricing_update ON public.sale_pricing AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((app.has_permission(auth.uid(), 'sales.manage'::text) AND app.sale_is_editable(sale_id)))
  WITH CHECK ((app.has_permission(auth.uid(), 'sales.manage'::text) AND app.sale_is_editable(sale_id)));

CREATE POLICY sales_insert_manage ON public.sales AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((app.has_permission(auth.uid(), 'sales.manage'::text) AND (created_by = auth.uid())));

CREATE POLICY sales_select_read_permission ON public.sales AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.read'::text));

CREATE POLICY sales_update_manage ON public.sales AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'sales.manage'::text));

CREATE POLICY sales_items_delete_manage ON public.sales_items AS PERMISSIVE FOR DELETE TO authenticated
  USING ((app.has_permission(auth.uid(), 'sales.manage'::text) AND app.sale_is_editable(sale_id)));

CREATE POLICY sales_items_insert_manage ON public.sales_items AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((app.has_permission(auth.uid(), 'sales.manage'::text) AND app.sale_is_editable(sale_id)));

CREATE POLICY sales_items_select_read_permission ON public.sales_items AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.read'::text));

CREATE POLICY sales_items_update_manage ON public.sales_items AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((app.has_permission(auth.uid(), 'sales.manage'::text) AND app.sale_is_editable(sale_id)))
  WITH CHECK ((app.has_permission(auth.uid(), 'sales.manage'::text) AND app.sale_is_editable(sale_id)));

CREATE POLICY "Managers can attach supplier quote files" ON public.supplier_quote_files AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY "Readers can view supplier quote files" ON public.supplier_quote_files AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.read'::text));

CREATE POLICY sql_delete_manage ON public.supplier_quote_lines AS PERMISSIVE FOR DELETE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY sql_insert_manage ON public.supplier_quote_lines AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY sql_select_read ON public.supplier_quote_lines AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.read'::text));

CREATE POLICY sql_update_manage ON public.supplier_quote_lines AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY supplier_quotes_insert_manage ON public.supplier_quotes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((app.has_permission(auth.uid(), 'leads.manage'::text) AND (created_by = auth.uid())));

CREATE POLICY supplier_quotes_select_read ON public.supplier_quotes AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.read'::text));

CREATE POLICY supplier_quotes_update_manage ON public.supplier_quotes AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY trd_delete_manage ON public.travel_requirement_destinations AS PERMISSIVE FOR DELETE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY trd_insert_manage ON public.travel_requirement_destinations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY trd_select_read_permission ON public.travel_requirement_destinations AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.read'::text));

CREATE POLICY trd_update_manage ON public.travel_requirement_destinations AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY travel_requirements_insert_manage ON public.travel_requirements AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((app.has_permission(auth.uid(), 'leads.manage'::text) AND (created_by = auth.uid())));

CREATE POLICY travel_requirements_select_read_permission ON public.travel_requirements AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.read'::text));

CREATE POLICY travel_requirements_update_manage ON public.travel_requirements AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'::text));

CREATE POLICY user_roles_delete_admin ON public.user_roles AS PERMISSIVE FOR DELETE TO authenticated
  USING (app.is_admin(auth.uid()));

CREATE POLICY user_roles_insert_admin ON public.user_roles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (app.is_admin(auth.uid()));

CREATE POLICY user_roles_select_own_or_admin ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((user_id = auth.uid()) AND app.is_active_user(auth.uid())) OR app.is_admin(auth.uid())));

CREATE POLICY user_roles_update_admin ON public.user_roles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.is_admin(auth.uid()))
  WITH CHECK (app.is_admin(auth.uid()));

CREATE POLICY vpa_delete ON public.vendor_payment_allocations AS PERMISSIVE FOR DELETE TO authenticated
  USING ((app.has_permission(auth.uid(), 'payments.manage'::text) AND app.vendor_payment_is_recorded(payment_id)));

CREATE POLICY vpa_insert ON public.vendor_payment_allocations AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((app.has_permission(auth.uid(), 'payments.manage'::text) AND app.vendor_payment_is_recorded(payment_id)) OR (app.has_permission(auth.uid(), 'payments.enter'::text) AND app.vendor_payment_is_own_recorded(payment_id))));

CREATE POLICY vpa_select ON public.vendor_payment_allocations AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'payments.read'::text));

CREATE POLICY vpa_update ON public.vendor_payment_allocations AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((app.has_permission(auth.uid(), 'payments.manage'::text) AND app.vendor_payment_is_recorded(payment_id)))
  WITH CHECK ((app.has_permission(auth.uid(), 'payments.manage'::text) AND app.vendor_payment_is_recorded(payment_id)));

CREATE POLICY vendor_payments_insert ON public.vendor_payments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((app.has_permission(auth.uid(), 'payments.manage'::text) OR app.has_permission(auth.uid(), 'payments.enter'::text)));

CREATE POLICY vendor_payments_select ON public.vendor_payments AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'payments.read'::text));

CREATE POLICY vendor_payments_update ON public.vendor_payments AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'payments.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'payments.manage'::text));

CREATE POLICY vendors_insert_manage ON public.vendors AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'vendors.manage'::text));

CREATE POLICY vendors_select_read_permission ON public.vendors AS PERMISSIVE FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'vendors.read'::text));

CREATE POLICY vendors_update_manage ON public.vendors AS PERMISSIVE FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'vendors.manage'::text))
  WITH CHECK (app.has_permission(auth.uid(), 'vendors.manage'::text));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('company-assets', 'company-assets', 'f', '2097152', NULL);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('supplier-quote-files', 'supplier-quote-files', 'f', '10485760', NULL);

CREATE POLICY "Admins can replace company assets" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((bucket_id = 'company-assets'::text) AND app.is_admin(auth.uid())));

CREATE POLICY "Admins can upload company assets" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'company-assets'::text) AND app.is_admin(auth.uid())));

CREATE POLICY "Managers can upload supplier quote files" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((bucket_id = 'supplier-quote-files'::text) AND app.has_permission(auth.uid(), 'leads.manage'::text) AND app.is_active_user(auth.uid()) AND (EXISTS ( SELECT 1
   FROM supplier_quotes q
  WHERE ((q.id)::text = (storage.foldername(objects.name))[1])))));

CREATE POLICY "Readers can open supplier quote files" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING (((bucket_id = 'supplier-quote-files'::text) AND app.has_permission(auth.uid(), 'leads.read'::text)));

CREATE POLICY "Signed-in users can read company assets" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
  USING ((bucket_id = 'company-assets'::text));

-- ===== Part 2: app schema (exported 2026-10-21 with supabase/export_app_schema.sql) =====

CREATE SCHEMA IF NOT EXISTS app;

CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE SEQUENCE IF NOT EXISTS drizzle.__drizzle_migrations_id_seq START 1 INCREMENT 1; -- last_value: unused

CREATE TABLE drizzle.__drizzle_migrations (
  id integer DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass) NOT NULL,
  hash text NOT NULL,
  created_at bigint
);

CREATE OR REPLACE FUNCTION app.assign_booking_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.booking_number := 'BK-' || lpad(nextval('public.booking_number_seq')::text, 6, '0');
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.audit_customer_quote()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _old jsonb; _new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app.write_audit('customer_quote.created', 'customer_quote', NEW.id::text, NULL,
      to_jsonb(NEW) - 'created_at' - 'updated_at' - 'share_token');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit('customer_quote.status_changed', 'customer_quote', NEW.id::text,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
  ELSE
    _old := to_jsonb(OLD) - 'created_at' - 'updated_at' - 'share_token' - 'view_count' - 'last_viewed_at';
    _new := to_jsonb(NEW) - 'created_at' - 'updated_at' - 'share_token' - 'view_count' - 'last_viewed_at';
    IF _old IS DISTINCT FROM _new THEN
      PERFORM app.write_audit('customer_quote.updated', 'customer_quote', NEW.id::text, _old, _new);
    END IF;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_customer_quote_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app.write_audit('customer_quote.line_added', 'customer_quote', NEW.customer_quote_id::text,
      NULL, to_jsonb(NEW) - 'created_at' - 'updated_at');
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM app.write_audit('customer_quote.line_updated', 'customer_quote', NEW.customer_quote_id::text,
      to_jsonb(OLD) - 'created_at' - 'updated_at', to_jsonb(NEW) - 'created_at' - 'updated_at');
  ELSE
    PERFORM app.write_audit('customer_quote.line_removed', 'customer_quote', OLD.customer_quote_id::text,
      to_jsonb(OLD) - 'created_at' - 'updated_at', NULL);
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_customer_quote_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _o jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _n jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb; _new jsonb := '{}'::jsonb; _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_n) LOOP
    IF _n->_key IS DISTINCT FROM _o->_key THEN
      _old := _old || jsonb_build_object(_key, _o->_key);
      _new := _new || jsonb_build_object(_key, _n->_key);
    END IF;
  END LOOP;
  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;
  PERFORM app.write_audit('customer_quote_pricing.updated', 'customer_quote',
    NEW.customer_quote_id::text, _old, _new);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_lead_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit('lead.created', 'lead', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at');
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_lead_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;

  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit('lead.status_changed', 'lead', NEW.id::text,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    _old := _old - 'status';
    _new := _new - 'status';
  END IF;

  IF _new <> '{}'::jsonb THEN
    PERFORM app.write_audit('lead.updated', 'lead', NEW.id::text, _old, _new);
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_master_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _entity text := TG_ARGV[0];
  _row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _src text := NULLIF(current_setting('app.import_source', true), '');
BEGIN
  IF _src IS NOT NULL THEN _row := _row || jsonb_build_object('import_source', _src); END IF;
  PERFORM app.write_audit(_entity || '.created', _entity, (_row->>'id'), NULL, _row);
  RETURN NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION app.audit_master_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _entity text := TG_ARGV[0];
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
  _action text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;

  IF _new = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    _action := _entity || CASE WHEN NEW.is_active THEN '.activated' ELSE '.deactivated' END;
  ELSE
    _action := _entity || '.updated';
  END IF;

  PERFORM app.write_audit(_action, _entity, NEW.id::text, _old, _new);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_money_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _entity text := TG_ARGV[0];
  _old_row jsonb; _new_row jsonb;
  _old jsonb := '{}'::jsonb; _new jsonb := '{}'::jsonb; _key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app.write_audit(_entity || '.created', _entity, NEW.id::text, NULL,
      to_jsonb(NEW) - 'created_at' - 'updated_at');
    RETURN NULL;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM app.write_audit(_entity || '.removed', _entity, OLD.id::text,
      to_jsonb(OLD) - 'created_at' - 'updated_at', NULL);
    RETURN NULL;
  END IF;
  _old_row := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row := to_jsonb(NEW) - 'created_at' - 'updated_at';
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;
  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;
  PERFORM app.write_audit(
    CASE WHEN _new_row->>'status' = 'cancelled' AND _old_row->>'status' IS DISTINCT FROM 'cancelled'
      THEN _entity || '.cancelled' ELSE _entity || '.updated' END,
    _entity, NEW.id::text, _old, _new);
  RETURN NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION app.audit_profile_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit(
    'profile.created', 'profile', NEW.id::text, NULL,
    jsonb_build_object('name', NEW.name, 'email', NEW.email, 'is_active', NEW.is_active)
  );
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _action text := 'profile.updated';
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    _old := _old || jsonb_build_object('name', OLD.name);
    _new := _new || jsonb_build_object('name', NEW.name);
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    _old := _old || jsonb_build_object('email', OLD.email);
    _new := _new || jsonb_build_object('email', NEW.email);
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    _old := _old || jsonb_build_object('is_active', OLD.is_active);
    _new := _new || jsonb_build_object('is_active', NEW.is_active);
    _action := CASE WHEN NEW.is_active THEN 'user.activated' ELSE 'user.deactivated' END;
  END IF;

  IF _new = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  PERFORM app.write_audit(_action, 'profile', NEW.id::text, _old, _new);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_purchase_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit('purchase.created', 'purchase', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at');
  RETURN NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION app.audit_purchase_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb; _new jsonb := '{}'::jsonb; _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;
  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;
  PERFORM app.write_audit(
    CASE WHEN NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN 'purchase.cancelled' ELSE 'purchase.updated' END,
    'purchase', NEW.id::text, _old, _new);
  RETURN NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION app.audit_requirement_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit('requirement.created', 'travel_requirement', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at');
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_requirement_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;

  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit('requirement.status_changed', 'travel_requirement', NEW.id::text,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    _old := _old - 'status';
    _new := _new - 'status';
  END IF;

  IF _new <> '{}'::jsonb THEN
    PERFORM app.write_audit('requirement.updated', 'travel_requirement', NEW.id::text, _old, _new);
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_role_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit(
    'role.assigned', 'user_role', NEW.user_id::text, NULL,
    jsonb_build_object('role', NEW.role)
  );
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_role_removed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit(
    'role.removed', 'user_role', OLD.user_id::text,
    jsonb_build_object('role', OLD.role), NULL
  );
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_cost_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit('sale_cost.deleted', 'sale_cost', OLD.id::text,
    to_jsonb(OLD) - 'created_at' - 'updated_at', NULL);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_cost_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit('sale_cost.created', 'sale_cost', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at');
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_cost_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;
  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;
  PERFORM app.write_audit('sale_cost.updated', 'sale_cost', NEW.id::text, _old, _new);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit(
    'sale.created', 'sale', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at'
  );
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_item_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit(
    'sale_item.deleted', 'sale_item', OLD.id::text,
    jsonb_build_object(
      'sale_id', OLD.sale_id,
      'item_type', OLD.item_type,
      'description', OLD.description,
      'vendor_id', OLD.vendor_id,
      'quantity', OLD.quantity,
      'sort_order', OLD.sort_order
    ),
    NULL
  );
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_item_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit(
    'sale_item.created', 'sale_item', NEW.id::text, NULL,
    jsonb_build_object(
      'sale_id', NEW.sale_id,
      'item_type', NEW.item_type,
      'description', NEW.description,
      'vendor_id', NEW.vendor_id,
      'quantity', NEW.quantity,
      'sort_order', NEW.sort_order
    )
  );
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_item_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
BEGIN
  IF NEW.item_type IS DISTINCT FROM OLD.item_type THEN
    _old := _old || jsonb_build_object('item_type', OLD.item_type);
    _new := _new || jsonb_build_object('item_type', NEW.item_type);
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    _old := _old || jsonb_build_object('description', OLD.description);
    _new := _new || jsonb_build_object('description', NEW.description);
  END IF;
  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    _old := _old || jsonb_build_object('vendor_id', OLD.vendor_id);
    _new := _new || jsonb_build_object('vendor_id', NEW.vendor_id);
  END IF;
  IF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    _old := _old || jsonb_build_object('quantity', OLD.quantity);
    _new := _new || jsonb_build_object('quantity', NEW.quantity);
  END IF;
  IF NEW.sort_order IS DISTINCT FROM OLD.sort_order THEN
    _old := _old || jsonb_build_object('sort_order', OLD.sort_order);
    _new := _new || jsonb_build_object('sort_order', NEW.sort_order);
  END IF;

  IF _new = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  PERFORM app.write_audit('sale_item.updated', 'sale_item', NEW.id::text, _old, _new);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_pricing_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;
  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;
  PERFORM app.write_audit('sale_pricing.updated', 'sale_pricing', NEW.sale_id::text, _old, _new);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;

  IF _new = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit(
      'sale.status_changed', 'sale', NEW.id::text,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
    _old := _old - 'status';
    _new := _new - 'status';
  END IF;

  IF _new <> '{}'::jsonb THEN
    PERFORM app.write_audit('sale.updated', 'sale', NEW.id::text, _old, _new);
  END IF;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_supplier_quote()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _old jsonb; _new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app.write_audit('supplier_quote.created', 'supplier_quote', NEW.id::text, NULL,
      to_jsonb(NEW) - 'created_at' - 'updated_at');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit('supplier_quote.status_changed', 'supplier_quote', NEW.id::text,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
  ELSE
    _old := to_jsonb(OLD) - 'created_at' - 'updated_at';
    _new := to_jsonb(NEW) - 'created_at' - 'updated_at';
    IF _old IS DISTINCT FROM _new THEN
      PERFORM app.write_audit('supplier_quote.updated', 'supplier_quote', NEW.id::text, _old, _new);
    END IF;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_supplier_quote_file()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit('supplier_quote.file_uploaded', 'supplier_quote',
    NEW.supplier_quote_id::text, NULL, to_jsonb(NEW) - 'created_at');
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_supplier_quote_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app.write_audit('supplier_quote.line_added', 'supplier_quote', NEW.supplier_quote_id::text,
      NULL, to_jsonb(NEW) - 'created_at' - 'updated_at');
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM app.write_audit('supplier_quote.line_updated', 'supplier_quote', NEW.supplier_quote_id::text,
      to_jsonb(OLD) - 'created_at' - 'updated_at', to_jsonb(NEW) - 'created_at' - 'updated_at');
  ELSE
    PERFORM app.write_audit('supplier_quote.line_removed', 'supplier_quote', OLD.supplier_quote_id::text,
      to_jsonb(OLD) - 'created_at' - 'updated_at', NULL);
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.block_invoice_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN RAISE EXCEPTION 'Invoices cannot be deleted'; END; $function$
;

CREATE OR REPLACE FUNCTION app.calc_pricing(_billing billing_type, _cost numeric, _markup_type markup_type, _markup_value numeric, _discount numeric, _tcs_applicable boolean, _tcs_rate numeric, OUT charge numeric, OUT selling numeric, OUT gst_rate numeric, OUT gst numeric, OUT tcs_rate numeric, OUT tcs numeric, OUT payable numeric, OUT profit numeric)
 RETURNS record
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  _cost := round(_cost, 2);
  charge := CASE _markup_type
    WHEN 'percentage' THEN round(_cost * _markup_value / 100, 2)
    WHEN 'lumpsum' THEN round(_markup_value, 2)
    ELSE 0 END;
  selling := round(_cost + charge - _discount, 2);
  IF selling < 0 THEN RAISE EXCEPTION 'The discount cannot exceed the selling value'; END IF;
  IF _billing = 'tour_package' THEN
    gst_rate := 5; gst := round(selling * 5 / 100, 2);
  ELSE
    -- Standalone services are taxed on the service charge only.
    gst_rate := 18; gst := round(charge * 18 / 100, 2);
  END IF;
  IF _tcs_applicable THEN
    tcs_rate := COALESCE(_tcs_rate, 2.00);
    tcs := round((selling + gst) * tcs_rate / 100, 2);
  ELSE
    tcs_rate := NULL; tcs := 0;
  END IF;
  payable := round(selling + gst + tcs, 2);
  -- TCS is never part of profit.
  profit := round(selling - _cost, 2);
END;
$function$
;

CREATE OR REPLACE FUNCTION app.can_read_invoices(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT app.has_role(_uid, 'admin') OR app.has_role(_uid, 'accounts') OR app.has_role(_uid, 'sales');
$function$
;

CREATE OR REPLACE FUNCTION app.check_receipt_total(_sale_id uuid, _exclude uuid, _amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _payable numeric; _received numeric; _linked numeric;
BEGIN
  PERFORM 1 FROM public.sales WHERE id = _sale_id FOR UPDATE;
  SELECT customer_payable INTO _payable FROM public.sale_pricing WHERE sale_id = _sale_id;
  SELECT COALESCE(sum(amount_inr), 0) INTO _received FROM public.customer_receipts
    WHERE sale_id = _sale_id AND status = 'recorded' AND (_exclude IS NULL OR id <> _exclude);
  SELECT COALESCE(sum(a.amount_inr), 0) INTO _linked FROM public.customer_receipt_allocations a
    JOIN public.customer_receipts r ON r.id = a.receipt_id AND r.status = 'recorded'
    WHERE a.sale_id = _sale_id;
  _received := _received + _linked;
  IF _received + _amount > COALESCE(_payable, 0) THEN
    RAISE EXCEPTION 'Receipts would exceed the booking''s customer payable (outstanding %)',
      to_char(GREATEST(COALESCE(_payable,0) - _received, 0), 'FM999999999990.00');
  END IF;
END; $function$
;

CREATE OR REPLACE FUNCTION app.compute_customer_quote_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _cost numeric(14,2); r record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id; NEW.customer_quote_id := OLD.customer_quote_id; NEW.created_at := OLD.created_at;
    IF COALESCE(current_setting('app.cq_recalc', true), '') <> 'on'
       AND NOT app.customer_quote_is_draft(NEW.customer_quote_id) THEN
      RAISE EXCEPTION 'Pricing can only be changed while the quote is a draft';
    END IF;
  END IF;
  SELECT COALESCE(round(SUM(expected_cost_inr), 2), 0) INTO _cost
    FROM public.customer_quote_lines WHERE customer_quote_id = NEW.customer_quote_id;
  r := app.calc_pricing(NEW.billing_type, _cost, NEW.markup_type, NEW.markup_value,
         NEW.discount_amount, NEW.tcs_applicable, NEW.tcs_rate);
  NEW.gst_rate := r.gst_rate;
  NEW.tcs_rate := r.tcs_rate;
  NEW.markup_amount := r.charge;
  NEW.service_charge_amount := r.charge;
  NEW.selling_value := r.selling;
  NEW.gst_amount := r.gst;
  NEW.tcs_amount := r.tcs;
  NEW.customer_payable := r.payable;
  NEW.expected_cost := _cost;
  NEW.expected_gross_profit := r.profit;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.compute_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.currency_code := upper(btrim(NEW.currency_code));
  IF NEW.currency_code = 'INR' THEN NEW.exchange_rate := 1; END IF;
  NEW.amount_inr := round(NEW.amount * NEW.exchange_rate, 2);
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.compute_sale_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.currency_code := upper(btrim(NEW.currency_code));
  IF NEW.currency_code = 'INR' THEN
    NEW.exchange_rate := 1;
  END IF;
  -- Client-supplied totals are always discarded and recomputed here.
  NEW.total_cost := round(NEW.quantity::numeric * NEW.unit_cost, 2);
  NEW.base_currency_cost := round(NEW.total_cost * NEW.exchange_rate, 2);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.compute_sale_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _billing public.billing_type; _cost numeric(14,2); r record;
BEGIN
  SELECT billing_type INTO _billing FROM public.sales WHERE id = NEW.sale_id;
  IF _billing IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  SELECT COALESCE(round(SUM(base_currency_cost), 2), 0) INTO _cost
    FROM public.sale_costs WHERE sale_id = NEW.sale_id;
  r := app.calc_pricing(_billing, _cost, NEW.markup_type, NEW.markup_value,
         NEW.discount_amount, NEW.tcs_applicable, NEW.tcs_rate);
  NEW.gst_rate := r.gst_rate;
  NEW.tcs_rate := r.tcs_rate;
  NEW.markup_amount := r.charge;
  NEW.service_charge_amount := r.charge;
  NEW.selling_value := r.selling;
  NEW.gst_amount := r.gst;
  NEW.tcs_amount := r.tcs;
  NEW.customer_payable := r.payable;
  NEW.expected_cost := _cost;
  NEW.expected_gross_profit := r.profit;
  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id; NEW.sale_id := OLD.sale_id; NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.create_customer_quote_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.customer_quote_pricing (customer_quote_id) VALUES (NEW.id);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.customer_quote_is_draft(_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.customer_quotes WHERE id = _id AND status = 'draft');
$function$
;

CREATE OR REPLACE FUNCTION app.customer_receipt_is_recorded(_receipt_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.customer_receipts WHERE id = _receipt_id AND status = 'recorded');
$function$
;

CREATE OR REPLACE FUNCTION app.guard_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.id = '00000000-0000-0000-0000-000000000001'::uuid THEN
      RAISE EXCEPTION 'The Unassigned account can''t be changed';
    END IF;
    NEW.id := OLD.id; NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at;
  ELSE
    NEW.created_by := auth.uid(); NEW.created_at := now(); NEW.updated_at := now();
  END IF;
  NEW.name := btrim(NEW.name);
  NEW.last4 := NULLIF(btrim(NEW.last4), '');
  -- Credit cards: the amount owed is entered positive and stored as a negative balance.
  IF NEW.account_type = 'credit_card' THEN NEW.opening_balance := -abs(NEW.opening_balance); END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_quote_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.quote_number := 'CQ-' || to_char(nextval('public.customer_quote_number_seq'), 'FM000000');
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status := 'draft';
  SELECT client_id INTO NEW.client_id FROM public.leads WHERE id = NEW.lead_id;
  IF NEW.client_id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF COALESCE(current_setting('app.cq_revision', true), '') <> 'on' THEN
    NEW.revision_no := 1;
    NEW.previous_quote_id := NULL;
    IF EXISTS (SELECT 1 FROM public.travel_requirements
               WHERE id = NEW.requirement_id AND status IN ('superseded','closed')) THEN
      RAISE EXCEPTION 'Customer quotes can only be added to draft or active requirements';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.travel_requirements
                 WHERE id = NEW.requirement_id AND lead_id = NEW.lead_id) THEN
    RAISE EXCEPTION 'Requirement does not belong to this lead';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_quote_insert_share()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.share_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  NEW.share_enabled := false;
  NEW.view_count := 0;
  NEW.last_viewed_at := NULL;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_quote_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _quote uuid; _src record; _req uuid;
BEGIN
  _quote := CASE WHEN TG_OP = 'DELETE' THEN OLD.customer_quote_id ELSE NEW.customer_quote_id END;
  IF TG_OP = 'UPDATE' AND NEW.customer_quote_id IS DISTINCT FROM OLD.customer_quote_id THEN
    RAISE EXCEPTION 'Lines cannot be moved between quotes';
  END IF;
  IF NOT app.customer_quote_is_draft(_quote) THEN
    RAISE EXCEPTION 'Lines can only be changed while the quote is a draft';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.currency := upper(btrim(NEW.currency));
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
    NEW.source_supplier_quote_line_id := OLD.source_supplier_quote_line_id;
    -- The cost snapshot of a supplier-sourced line never changes.
    IF OLD.source_supplier_quote_line_id IS NOT NULL THEN
      NEW.expected_cost_inr := OLD.expected_cost_inr;
    END IF;
  ELSE
    NEW.created_at := now();
    IF NEW.source_supplier_quote_line_id IS NOT NULL
       AND COALESCE(current_setting('app.cq_revision', true), '') <> 'on' THEN
      SELECT l.amount_inr, q.requirement_id INTO _src
        FROM public.supplier_quote_lines l
        JOIN public.supplier_quotes q ON q.id = l.supplier_quote_id
       WHERE l.id = NEW.source_supplier_quote_line_id;
      SELECT requirement_id INTO _req FROM public.customer_quotes WHERE id = _quote;
      IF _src IS NULL OR _src.requirement_id <> _req THEN
        RAISE EXCEPTION 'Supplier quote line does not belong to this requirement';
      END IF;
      NEW.expected_cost_inr := _src.amount_inr;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_quote_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rev boolean := COALESCE(current_setting('app.cq_revision', true), '') = 'on';
  _view boolean := COALESCE(current_setting('app.cq_view', true), '') = 'on';
BEGIN
  NEW.id := OLD.id;
  NEW.quote_number := OLD.quote_number;
  NEW.lead_id := OLD.lead_id;
  NEW.requirement_id := OLD.requirement_id;
  NEW.client_id := OLD.client_id;
  NEW.revision_no := OLD.revision_no;
  NEW.previous_quote_id := OLD.previous_quote_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.share_token := OLD.share_token;
  IF NOT _view THEN
    NEW.view_count := OLD.view_count;
    NEW.last_viewed_at := OLD.last_viewed_at;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'superseded' THEN
      IF NOT _rev THEN RAISE EXCEPTION 'Quotes are superseded only by creating a revision'; END IF;
    ELSIF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('sent','accepted'))
      OR (OLD.status = 'sent' AND NEW.status IN ('accepted','rejected','expired'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status <> 'draft' THEN
    -- Only sharing state and view tracking may change after a quote leaves Draft.
    IF (to_jsonb(NEW) - 'share_enabled' - 'view_count' - 'last_viewed_at' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'share_enabled' - 'view_count' - 'last_viewed_at' - 'updated_at') THEN
      RAISE EXCEPTION 'A % customer quote can no longer be edited', OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_receipt_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _rec public.customer_receipts; _sale public.sales;
BEGIN
  NEW.id := gen_random_uuid(); NEW.created_at := now(); NEW.updated_at := now();
  SELECT * INTO _rec FROM public.customer_receipts WHERE id = NEW.receipt_id FOR UPDATE;
  SELECT * INTO _sale FROM public.sales WHERE id = NEW.sale_id;
  IF _rec.id IS NULL OR _rec.status <> 'recorded' THEN RAISE EXCEPTION 'Receipt not found or cancelled'; END IF;
  IF _rec.sale_id IS NOT NULL THEN RAISE EXCEPTION 'This receipt is already recorded against a booking'; END IF;
  IF _sale.id IS NULL OR _sale.status = 'cancelled' THEN RAISE EXCEPTION 'Advances can only be linked to bookings that are not cancelled'; END IF;
  IF _sale.client_id <> _rec.client_id THEN RAISE EXCEPTION 'Advances can only be linked to the same client''s bookings'; END IF;
  IF app.receipt_allocated(_rec.id) + NEW.amount_inr > _rec.amount_inr THEN
    RAISE EXCEPTION 'Links exceed the unallocated amount of %', _rec.receipt_number;
  END IF;
  PERFORM app.check_receipt_total(NEW.sale_id, NULL, NEW.amount_inr);
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_receipt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := gen_random_uuid();
  NEW.receipt_number := 'RC-' || lpad(nextval('public.customer_receipt_number_seq')::text, 6, '0');
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status := 'recorded';
  NEW.cancel_reason := NULL;
  NEW.reference := NULLIF(btrim(NEW.reference), '');
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  IF NEW.created_by IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NEW.sale_id IS NOT NULL THEN
    SELECT client_id INTO NEW.client_id FROM public.sales WHERE id = NEW.sale_id;
    IF NOT app.sale_accepts_purchases(NEW.sale_id) THEN
      RAISE EXCEPTION 'Receipts can''t be recorded on a cancelled booking';
    END IF;
    PERFORM app.check_receipt_total(NEW.sale_id, NULL, NEW.amount_inr);
  ELSIF NEW.client_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clients WHERE id = NEW.client_id) THEN
    RAISE EXCEPTION 'Select a client or a booking';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_receipt_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := OLD.id;
  NEW.receipt_number := OLD.receipt_number;
  NEW.sale_id := OLD.sale_id;
  NEW.client_id := OLD.client_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled receipt can no longer be changed';
  END IF;
  IF NEW.status = 'cancelled' THEN
    NEW.payment_type := OLD.payment_type; NEW.receipt_date := OLD.receipt_date;
    NEW.amount_inr := OLD.amount_inr; NEW.method := OLD.method;
    NEW.reference := OLD.reference; NEW.notes := OLD.notes;
    NEW.cancel_reason := NULLIF(btrim(NEW.cancel_reason), '');
    IF NEW.cancel_reason IS NULL THEN RAISE EXCEPTION 'A reason is required to cancel a receipt'; END IF;
    RETURN NEW;
  END IF;
  NEW.status := 'recorded';
  NEW.cancel_reason := NULL;
  NEW.reference := NULLIF(btrim(NEW.reference), '');
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  IF OLD.sale_id IS NOT NULL THEN
    IF NOT app.sale_accepts_purchases(OLD.sale_id) THEN
      RAISE EXCEPTION 'Receipts on a cancelled booking can only be cancelled';
    END IF;
    PERFORM app.check_receipt_total(OLD.sale_id, OLD.id, NEW.amount_inr);
  ELSIF NEW.amount_inr < app.receipt_allocated(OLD.id) THEN
    RAISE EXCEPTION 'The amount can''t be less than what is already linked to bookings';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_invoice_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'cancelled' THEN RAISE EXCEPTION 'A cancelled invoice can no longer be changed'; END IF;
  IF NEW.status <> 'cancelled' THEN RAISE EXCEPTION 'An issued invoice cannot be edited'; END IF;
  IF (to_jsonb(NEW) - 'status' - 'cancel_reason' - 'cancelled_at' - 'cancelled_by' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'cancel_reason' - 'cancelled_at' - 'cancelled_by' - 'updated_at') THEN
    RAISE EXCEPTION 'An issued invoice cannot be edited';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_lead_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Browser-supplied numbers are always discarded.
  NEW.lead_number := 'LD-' || to_char(nextval('public.lead_number_seq'), 'FM000000');

  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_active) THEN
    RAISE EXCEPTION 'A new lead requires an active client';
  END IF;

  IF NOT app.is_active_user(NEW.assigned_to) THEN
    RAISE EXCEPTION 'The lead must be assigned to an active user';
  END IF;

  IF NEW.status <> 'new' THEN
    RAISE EXCEPTION 'New leads must start with the New status';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_lead_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := OLD.id;
  NEW.lead_number := OLD.lead_number;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_active) THEN
    RAISE EXCEPTION 'The selected client must be active';
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NOT app.is_active_user(NEW.assigned_to) THEN
    RAISE EXCEPTION 'The lead must be assigned to an active user';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'new' AND NEW.status IN ('in_progress','quoted','lost'))
      OR (OLD.status = 'in_progress' AND NEW.status IN ('quoted','negotiation','lost'))
      OR (OLD.status = 'quoted' AND NEW.status IN ('negotiation','won','lost'))
      OR (OLD.status = 'negotiation' AND NEW.status IN ('quoted','won','lost'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status IN ('won','lost') THEN
    RAISE EXCEPTION 'A % lead can no longer be edited', OLD.status;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_money_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' THEN
    NEW.account_id := OLD.account_id; NEW.cleared := OLD.cleared; NEW.cleared_on := OLD.cleared_on;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.account_id AND is_active) THEN
      RAISE EXCEPTION 'Select an active account';
    END IF;
  END IF;
  IF NEW.cleared THEN NEW.cleared_on := COALESCE(NEW.cleared_on, current_date);
  ELSE NEW.cleared_on := NULL; END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_other_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.id := gen_random_uuid();
    NEW.entry_number := 'OT-' || lpad(nextval('public.other_transaction_number_seq')::text, 6, '0');
    NEW.created_by := auth.uid(); NEW.created_at := now(); NEW.updated_at := now();
    NEW.status := 'recorded'; NEW.cancel_reason := NULL;
    IF NEW.created_by IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  ELSE
    NEW.id := OLD.id; NEW.entry_number := OLD.entry_number;
    NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at;
    IF OLD.status = 'cancelled' THEN RAISE EXCEPTION 'A cancelled entry can no longer be changed'; END IF;
    IF NEW.status = 'cancelled' THEN
      NEW.txn_type := OLD.txn_type; NEW.txn_date := OLD.txn_date; NEW.amount_inr := OLD.amount_inr;
      NEW.account_id := OLD.account_id; NEW.to_account_id := OLD.to_account_id;
      NEW.category := OLD.category; NEW.party := OLD.party; NEW.notes := OLD.notes;
      NEW.reference := OLD.reference; NEW.cleared := OLD.cleared; NEW.cleared_on := OLD.cleared_on;
      NEW.cancel_reason := NULLIF(btrim(NEW.cancel_reason), '');
      IF NEW.cancel_reason IS NULL THEN RAISE EXCEPTION 'A reason is required to cancel an entry'; END IF;
      RETURN NEW;
    END IF;
    NEW.status := 'recorded'; NEW.cancel_reason := NULL;
  END IF;
  NEW.category := NULLIF(btrim(NEW.category), '');
  NEW.party := NULLIF(btrim(NEW.party), '');
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  NEW.reference := NULLIF(btrim(NEW.reference), '');
  IF TG_OP = 'INSERT' OR NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.account_id AND is_active) THEN
      RAISE EXCEPTION 'Select an active account';
    END IF;
  END IF;
  IF NEW.to_account_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.to_account_id IS DISTINCT FROM OLD.to_account_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.to_account_id AND is_active) THEN
      RAISE EXCEPTION 'Select an active "to" account';
    END IF;
  END IF;
  IF NEW.cleared THEN NEW.cleared_on := COALESCE(NEW.cleared_on, current_date);
  ELSE NEW.cleared_on := NULL; END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Profile identity cannot be changed';
  END IF;

  -- The profile email mirrors the authentication identity and is read-only here.
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Profile email is read-only and derived from the authenticated account';
  END IF;

  IF NOT app.is_admin(auth.uid()) AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Only administrators can change account status';
  END IF;

  IF OLD.is_active AND NOT NEW.is_active
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = OLD.id AND role = 'admin'::public.app_role
     )
     AND NOT app.other_active_admin_exists(OLD.id) THEN
    RAISE EXCEPTION 'At least one active administrator must remain';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_purchase_allocations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'recorded' THEN
    IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id AND app.purchase_allocated(OLD.id) > 0 THEN
      RAISE EXCEPTION 'This purchase has vendor payments allocated; the vendor can''t be changed';
    END IF;
    IF NEW.amount_inr < app.purchase_allocated(OLD.id) THEN
      RAISE EXCEPTION 'The INR amount can''t be less than the payments already allocated';
    END IF;
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_purchase_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := gen_random_uuid();
  NEW.purchase_number := 'PU-' || lpad(nextval('public.purchase_number_seq')::text, 6, '0');
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status := 'recorded';
  NEW.cancel_reason := NULL;
  IF NEW.created_by IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT app.sale_accepts_purchases(NEW.sale_id) THEN
    RAISE EXCEPTION 'Purchases can''t be added to a cancelled booking';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_purchase_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := OLD.id;
  NEW.purchase_number := OLD.purchase_number;
  NEW.sale_id := OLD.sale_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF NOT app.sale_accepts_purchases(OLD.sale_id) THEN
    RAISE EXCEPTION 'Purchases on a cancelled booking can no longer be changed';
  END IF;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled purchase can no longer be changed';
  END IF;
  IF NEW.status = 'cancelled' THEN
    NEW.vendor_id := OLD.vendor_id;
    NEW.vendor_invoice_number := OLD.vendor_invoice_number;
    NEW.invoice_date := OLD.invoice_date;
    NEW.currency_code := OLD.currency_code;
    NEW.exchange_rate := OLD.exchange_rate;
    NEW.amount := OLD.amount;
    NEW.notes := OLD.notes;
    NEW.cancel_reason := NULLIF(btrim(NEW.cancel_reason), '');
    IF NEW.cancel_reason IS NULL THEN RAISE EXCEPTION 'A reason is required to cancel a purchase'; END IF;
  ELSE
    NEW.status := 'recorded';
    NEW.cancel_reason := NULL;
    IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
      RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
    END IF;
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_requirement_destination()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _req public.travel_requirements;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO _req FROM public.travel_requirements WHERE id = OLD.requirement_id;
    IF _req.id IS NOT NULL AND _req.status IN ('superseded','closed') THEN
      RAISE EXCEPTION 'A % requirement can no longer be edited', _req.status;
    END IF;
    RETURN OLD;
  END IF;

  SELECT * INTO _req FROM public.travel_requirements WHERE id = NEW.requirement_id;
  IF _req.id IS NULL THEN
    RAISE EXCEPTION 'Requirement not found';
  END IF;
  IF _req.status IN ('superseded','closed') THEN
    RAISE EXCEPTION 'A % requirement can no longer be edited', _req.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = NEW.destination_id AND d.is_active) THEN
    RAISE EXCEPTION 'The selected destination does not exist or is inactive';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_requirement_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.requirement_number := 'RQ-' || to_char(nextval('public.requirement_number_seq'), 'FM000000');

  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = NEW.lead_id) THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  IF NOT app.lead_is_editable(NEW.lead_id) THEN
    RAISE EXCEPTION 'Requirements can only be added while the lead is open';
  END IF;
  IF NEW.status NOT IN ('draft','active') THEN
    RAISE EXCEPTION 'New requirements must start as Draft or Active';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_requirement_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := OLD.id;
  NEW.requirement_number := OLD.requirement_number;
  NEW.lead_id := OLD.lead_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('active','closed'))
      OR (OLD.status = 'active' AND NEW.status IN ('superseded','closed'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status IN ('superseded','closed') THEN
    RAISE EXCEPTION 'A % requirement can no longer be edited', OLD.status;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_role_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.role = 'admin'::public.app_role
     AND NOT app.other_active_admin_exists(OLD.user_id) THEN
    RAISE EXCEPTION 'At least one active administrator must remain';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_booking_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.booking_number := OLD.booking_number;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_cost_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT app.sale_is_editable(OLD.sale_id) THEN
    RAISE EXCEPTION 'Costs can only be removed while the booking is pending or confirmed';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_cost_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT app.sale_is_editable(NEW.sale_id) THEN
    RAISE EXCEPTION 'Costs can only be added while the booking is pending or confirmed';
  END IF;
  IF NEW.vendor_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_cost_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := OLD.id;
  NEW.sale_id := OLD.sale_id;
  NEW.created_at := OLD.created_at;

  IF NOT app.sale_is_editable(OLD.sale_id) THEN
    RAISE EXCEPTION 'Costs can only be edited while the booking is pending or confirmed';
  END IF;

  IF NEW.vendor_id IS NOT NULL
     AND NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_active) THEN
    RAISE EXCEPTION 'A new booking requires an active client';
  END IF;

  IF NEW.destination_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = NEW.destination_id AND d.is_active) THEN
    RAISE EXCEPTION 'A new booking requires an active destination';
  END IF;

  IF NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'New bookings must start as Pending';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_item_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT app.sale_is_editable(OLD.sale_id) THEN
    RAISE EXCEPTION 'Components can only be removed while the booking is pending or confirmed';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_item_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT app.sale_is_editable(NEW.sale_id) THEN
    RAISE EXCEPTION 'Components can only be added while the booking is pending or confirmed';
  END IF;

  IF NEW.vendor_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_item_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Component identity cannot be changed';
  END IF;
  IF NEW.sale_id <> OLD.sale_id THEN
    RAISE EXCEPTION 'A component cannot be moved to another booking';
  END IF;
  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Component creation time cannot be changed';
  END IF;

  IF NOT app.sale_is_editable(OLD.sale_id) THEN
    RAISE EXCEPTION 'Components can only be edited while the booking is pending or confirmed';
  END IF;

  -- A newly associated vendor must be active; an unchanged historical vendor stays.
  IF NEW.vendor_id IS NOT NULL
     AND NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_pricing_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _status public.sale_status;
BEGIN
  SELECT status INTO _status FROM public.sales WHERE id = NEW.sale_id;
  IF _status IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  IF _status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Pricing can only be changed while the booking is pending or confirmed';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_quote_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.customer_quote_id IS DISTINCT FROM OLD.customer_quote_id OR NEW.quote_itinerary IS DISTINCT FROM OLD.quote_itinerary THEN
      RAISE EXCEPTION 'Booking quote link and itinerary snapshot are immutable';
    END IF;
  ELSIF NEW.customer_quote_id IS NOT NULL OR NEW.quote_itinerary IS NOT NULL THEN
    IF COALESCE(current_setting('app.cq_conversion', true), '') <> NEW.customer_quote_id::text
       OR NEW.customer_quote_id IS NULL THEN
      RAISE EXCEPTION 'Quote links can only be created by accepted quote conversion';
    END IF;
    IF NOT app.has_permission(auth.uid(), 'leads.manage') OR NOT app.has_permission(auth.uid(), 'sales.manage')
       OR NOT EXISTS (SELECT 1 FROM public.customer_quotes WHERE id = NEW.customer_quote_id AND status = 'accepted' AND client_id = NEW.client_id) THEN
      RAISE EXCEPTION 'Not allowed to link this quote';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Historical integrity
  NEW.id := OLD.id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.booking_date := OLD.booking_date;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_active) THEN
    RAISE EXCEPTION 'The selected client must be active';
  END IF;

  IF NEW.destination_id IS DISTINCT FROM OLD.destination_id
     AND NEW.destination_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = NEW.destination_id AND d.is_active) THEN
    RAISE EXCEPTION 'The selected destination must be active';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
      OR (OLD.status = 'confirmed' AND NEW.status IN ('completed', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'A % booking can no longer be edited', OLD.status;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_file()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Supplier quote files cannot be changed or deleted'; END IF;
  NEW.uploaded_by := auth.uid();
  NEW.created_at := now();
  IF NEW.uploaded_by IS NULL OR NOT app.is_active_user(NEW.uploaded_by) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF split_part(NEW.storage_path, '/', 1) <> NEW.supplier_quote_id::text THEN
    RAISE EXCEPTION 'File path does not belong to this quote';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects
                 WHERE bucket_id = 'supplier-quote-files' AND name = NEW.storage_path) THEN
    RAISE EXCEPTION 'Uploaded file not found';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.quote_number := 'SQ-' || to_char(nextval('public.supplier_quote_number_seq'), 'FM000000');
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status := 'requested';
  NEW.is_superseded := false;
  IF COALESCE(current_setting('app.sq_revision', true), '') <> 'on' THEN
    NEW.revision_number := 1;
    NEW.previous_quote_id := NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.travel_requirements
                 WHERE id = NEW.requirement_id AND lead_id = NEW.lead_id) THEN
    RAISE EXCEPTION 'Requirement does not belong to this lead';
  END IF;
  IF EXISTS (SELECT 1 FROM public.travel_requirements
             WHERE id = NEW.requirement_id AND status IN ('superseded','closed')) THEN
    RAISE EXCEPTION 'Supplier quotes can only be added to draft or active requirements';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'Vendor is inactive or does not exist';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _quote uuid;
BEGIN
  _quote := CASE WHEN TG_OP = 'DELETE' THEN OLD.supplier_quote_id ELSE NEW.supplier_quote_id END;
  IF TG_OP = 'UPDATE' AND NEW.supplier_quote_id IS DISTINCT FROM OLD.supplier_quote_id THEN
    RAISE EXCEPTION 'Lines cannot be moved between quotes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supplier_quotes
                 WHERE id = _quote AND status IN ('requested','received') AND NOT is_superseded) THEN
    RAISE EXCEPTION 'Lines cannot be changed once the quote is selected, rejected or superseded';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' THEN NEW.created_at := OLD.created_at; ELSE NEW.created_at := now(); END IF;
  NEW.currency := upper(btrim(NEW.currency));
  IF NEW.currency = 'INR' THEN NEW.exchange_rate := 1; END IF;
  NEW.amount_inr := round(NEW.quantity::numeric * NEW.unit_amount * NEW.exchange_rate, 2);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _rev boolean := COALESCE(current_setting('app.sq_revision', true), '') = 'on';
BEGIN
  NEW.id := OLD.id;
  NEW.quote_number := OLD.quote_number;
  NEW.lead_id := OLD.lead_id;
  NEW.requirement_id := OLD.requirement_id;
  NEW.vendor_id := OLD.vendor_id;
  NEW.revision_number := OLD.revision_number;
  NEW.previous_quote_id := OLD.previous_quote_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF OLD.is_superseded THEN
    RAISE EXCEPTION 'A superseded supplier quote can no longer be edited';
  END IF;
  IF NEW.is_superseded THEN
    IF NOT _rev THEN RAISE EXCEPTION 'Quotes are superseded only by creating a revision'; END IF;
    NEW.status := OLD.status;
    NEW.valid_until := OLD.valid_until;
    NEW.notes := OLD.notes;
    NEW.adults := OLD.adults;
    NEW.children := OLD.children;
    NEW.child_ages := OLD.child_ages;
    NEW.inclusions := OLD.inclusions;
    NEW.exclusions := OLD.exclusions;
    NEW.itinerary_notes := OLD.itinerary_notes;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'requested' AND NEW.status IN ('received','rejected'))
      OR (OLD.status = 'received' AND NEW.status IN ('selected','rejected'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status IN ('selected','rejected') THEN
    RAISE EXCEPTION 'A % supplier quote can no longer be edited', OLD.status;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_vendor_payment_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _pay public.vendor_payments; _pur public.purchases;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id; NEW.payment_id := OLD.payment_id; NEW.purchase_id := OLD.purchase_id;
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.id := gen_random_uuid(); NEW.created_at := now(); NEW.updated_at := now();
  END IF;
  SELECT * INTO _pay FROM public.vendor_payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT * INTO _pur FROM public.purchases WHERE id = NEW.purchase_id FOR UPDATE;
  IF _pay.id IS NULL OR _pay.status <> 'recorded' THEN RAISE EXCEPTION 'Payment not found or cancelled'; END IF;
  IF _pur.id IS NULL OR _pur.status <> 'recorded' THEN RAISE EXCEPTION 'Allocations can only go to recorded purchases'; END IF;
  IF _pur.vendor_id <> _pay.vendor_id THEN RAISE EXCEPTION 'Allocations must go to purchases of the same vendor'; END IF;
  IF _pay.sale_id IS NOT NULL AND _pur.sale_id <> _pay.sale_id THEN
    RAISE EXCEPTION 'This payment is linked to a booking; allocate only to that booking''s purchases';
  END IF;
  IF app.payment_allocated(_pay.id, NEW.id) + NEW.amount_inr > _pay.amount_inr THEN
    RAISE EXCEPTION 'Allocations exceed the payment amount (%)', _pay.payment_number;
  END IF;
  IF app.purchase_allocated(_pur.id, NEW.id) + NEW.amount_inr > _pur.amount_inr THEN
    RAISE EXCEPTION 'Allocation exceeds the outstanding amount of %', _pur.purchase_number;
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_vendor_payment_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := gen_random_uuid();
  NEW.payment_number := 'PY-' || lpad(nextval('public.vendor_payment_number_seq')::text, 6, '0');
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status := 'recorded';
  NEW.cancel_reason := NULL;
  NEW.reference := NULLIF(btrim(NEW.reference), '');
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  IF NEW.created_by IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;
  IF NEW.sale_id IS NOT NULL AND NOT app.sale_accepts_purchases(NEW.sale_id) THEN
    RAISE EXCEPTION 'Payments can''t be linked to a cancelled booking';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_vendor_payment_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := OLD.id;
  NEW.payment_number := OLD.payment_number;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled payment can no longer be changed';
  END IF;
  IF NEW.status = 'cancelled' THEN
    NEW.vendor_id := OLD.vendor_id; NEW.sale_id := OLD.sale_id;
    NEW.payment_type := OLD.payment_type; NEW.payment_date := OLD.payment_date;
    NEW.amount_inr := OLD.amount_inr; NEW.method := OLD.method;
    NEW.reference := OLD.reference; NEW.notes := OLD.notes;
    NEW.cancel_reason := NULLIF(btrim(NEW.cancel_reason), '');
    IF NEW.cancel_reason IS NULL THEN RAISE EXCEPTION 'A reason is required to cancel a payment'; END IF;
    RETURN NEW;
  END IF;
  NEW.status := 'recorded';
  NEW.cancel_reason := NULL;
  NEW.reference := NULLIF(btrim(NEW.reference), '');
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
      RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
    END IF;
    IF EXISTS (SELECT 1 FROM public.vendor_payment_allocations WHERE payment_id = OLD.id) THEN
      RAISE EXCEPTION 'Remove the allocations before changing the vendor';
    END IF;
  END IF;
  IF NEW.sale_id IS DISTINCT FROM OLD.sale_id THEN
    IF NEW.sale_id IS NOT NULL AND NOT app.sale_accepts_purchases(NEW.sale_id) THEN
      RAISE EXCEPTION 'Payments can''t be linked to a cancelled booking';
    END IF;
    IF NEW.sale_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.vendor_payment_allocations a JOIN public.purchases p ON p.id = a.purchase_id
      WHERE a.payment_id = OLD.id AND p.sale_id <> NEW.sale_id) THEN
      RAISE EXCEPTION 'Allocations must belong to the linked booking';
    END IF;
  END IF;
  IF NEW.amount_inr < app.payment_allocated(OLD.id) THEN
    RAISE EXCEPTION 'The amount can''t be less than what is already allocated';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_vendor_type_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.vendor_type_id IS DISTINCT FROM OLD.vendor_type_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vendor_types
      WHERE id = NEW.vendor_type_id AND is_active
    ) THEN
      RAISE EXCEPTION 'The selected vendor type is not active';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.has_permission(_user_id uuid, _permission_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT app.is_active_user(_user_id) AND (
    app.is_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = _user_id AND rp.permission_key = _permission_key
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION app.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT app.is_active_user(_user_id)
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$function$
;

CREATE OR REPLACE FUNCTION app.is_active_user(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), FALSE);
$function$
;

CREATE OR REPLACE FUNCTION app.is_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT app.is_active_user(_user_id)
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::public.app_role);
$function$
;

CREATE OR REPLACE FUNCTION app.lead_is_editable(_lead_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = _lead_id AND status NOT IN ('won','lost')
  );
$function$
;

CREATE OR REPLACE FUNCTION app.normalize_vendor_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.name := btrim(NEW.name);
  IF NEW.name = '' THEN
    RAISE EXCEPTION 'Vendor type name is required';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.other_active_admin_exists(_excluded_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'admin'::public.app_role
      AND ur.user_id <> _excluded_user_id
      AND p.is_active
  );
$function$
;

CREATE OR REPLACE FUNCTION app.payment_allocated(_payment_id uuid, _exclude uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(sum(a.amount_inr), 0) FROM public.vendor_payment_allocations a
  JOIN public.purchases p ON p.id = a.purchase_id AND p.status = 'recorded'
  WHERE a.payment_id = _payment_id AND (_exclude IS NULL OR a.id <> _exclude);
$function$
;

CREATE OR REPLACE FUNCTION app.purchase_allocated(_purchase_id uuid, _exclude uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(sum(a.amount_inr), 0) FROM public.vendor_payment_allocations a
  JOIN public.vendor_payments v ON v.id = a.payment_id AND v.status = 'recorded'
  WHERE a.purchase_id = _purchase_id AND (_exclude IS NULL OR a.id <> _exclude);
$function$
;

CREATE OR REPLACE FUNCTION app.recalculate_sale_pricing(_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.sale_pricing (sale_id) VALUES (_sale_id)
  ON CONFLICT (sale_id) DO UPDATE SET updated_at = now();
END;
$function$
;

CREATE OR REPLACE FUNCTION app.receipt_allocated(_receipt_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(sum(amount_inr), 0) FROM public.customer_receipt_allocations WHERE receipt_id = _receipt_id;
$function$
;

CREATE OR REPLACE FUNCTION app.sale_accepts_purchases(_sale_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.sales WHERE id = _sale_id AND status <> 'cancelled'::public.sale_status);
$function$
;

CREATE OR REPLACE FUNCTION app.sale_is_editable(_sale_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sales
    WHERE id = _sale_id
      AND status IN ('pending'::public.sale_status, 'confirmed'::public.sale_status)
  );
$function$
;

CREATE OR REPLACE FUNCTION app.sync_customer_quote_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.cq_recalc', 'on', true);
  UPDATE public.customer_quote_pricing SET markup_type = markup_type
   WHERE customer_quote_id = COALESCE(NEW.customer_quote_id, OLD.customer_quote_id);
  PERFORM set_config('app.cq_recalc', 'off', true);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.sync_sale_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sale_id uuid := COALESCE(NEW.sale_id, OLD.sale_id);
BEGIN
  PERFORM app.recalculate_sale_pricing(_sale_id);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.sync_sale_pricing_on_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.recalculate_sale_pricing(NEW.id);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.vendor_payment_is_own_recorded(_payment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.vendor_payments WHERE id = _payment_id AND status = 'recorded' AND created_by = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION app.vendor_payment_is_recorded(_payment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.vendor_payments WHERE id = _payment_id AND status = 'recorded');
$function$
;

CREATE OR REPLACE FUNCTION app.write_audit(_action text, _entity_type text, _entity_id text, _old jsonb, _new jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, _old, _new);
END;
$function$
;
