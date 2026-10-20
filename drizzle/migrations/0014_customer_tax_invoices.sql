-- Company settings (single row) -------------------------------------------
CREATE TABLE public.company_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  legal_name text CHECK (legal_name IS NULL OR char_length(legal_name) <= 200),
  trade_name text CHECK (trade_name IS NULL OR char_length(trade_name) <= 200),
  gstin text CHECK (gstin IS NULL OR char_length(gstin) <= 20),
  address text CHECK (address IS NULL OR char_length(address) <= 600),
  state text CHECK (state IS NULL OR char_length(state) <= 80),
  phone text CHECK (phone IS NULL OR char_length(phone) <= 40),
  email text CHECK (email IS NULL OR char_length(email) <= 200),
  bank_name text CHECK (bank_name IS NULL OR char_length(bank_name) <= 120),
  bank_account_name text CHECK (bank_account_name IS NULL OR char_length(bank_account_name) <= 160),
  bank_account_number text CHECK (bank_account_number IS NULL OR char_length(bank_account_number) <= 40),
  bank_ifsc text CHECK (bank_ifsc IS NULL OR char_length(bank_ifsc) <= 20),
  upi_id text CHECK (upi_id IS NULL OR char_length(upi_id) <= 100),
  logo_path text CHECK (logo_path IS NULL OR char_length(logo_path) <= 300),
  invoice_prefix text NOT NULL DEFAULT 'INV' CHECK (invoice_prefix ~ '^[A-Za-z0-9-]{1,10}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.company_settings TO authenticated;
GRANT ALL ON public.company_settings TO service_role;
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY company_settings_select ON public.company_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY company_settings_update_admin ON public.company_settings FOR UPDATE TO authenticated
  USING (app.is_admin(auth.uid())) WITH CHECK (app.is_admin(auth.uid()));
INSERT INTO public.company_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TRIGGER company_settings_set_updated_at BEFORE UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER company_settings_audit AFTER UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('company_settings');

-- Client state (place of supply) -------------------------------------------
ALTER TABLE public.clients ADD COLUMN state text
  CHECK (state IS NULL OR char_length(state) <= 80);

-- Invoice counters (gapless per financial year; internal only) -------------
CREATE TABLE public.invoice_counters (
  financial_year text PRIMARY KEY,
  last_number integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.invoice_counters TO service_role;
ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;

-- Invoices ------------------------------------------------------------------
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  financial_year text NOT NULL,
  sequence_no integer NOT NULL,
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  invoice_date date NOT NULL,
  client_name text NOT NULL,
  total_payable numeric(14,2) NOT NULL,
  snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),
  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (financial_year, sequence_no)
);
CREATE UNIQUE INDEX invoices_one_active_per_sale ON public.invoices (sale_id) WHERE status = 'issued';
GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.can_read_invoices(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT app.has_role(_uid, 'admin') OR app.has_role(_uid, 'accounts') OR app.has_role(_uid, 'sales');
$$;
CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated
  USING (app.can_read_invoices(auth.uid()));

-- Immutability: only the cancel fields may change, once.
CREATE OR REPLACE FUNCTION app.guard_invoice_update()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status = 'cancelled' THEN RAISE EXCEPTION 'A cancelled invoice can no longer be changed'; END IF;
  IF NEW.status <> 'cancelled' THEN RAISE EXCEPTION 'An issued invoice cannot be edited'; END IF;
  IF (to_jsonb(NEW) - 'status' - 'cancel_reason' - 'cancelled_at' - 'cancelled_by' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'cancel_reason' - 'cancelled_at' - 'cancelled_by' - 'updated_at') THEN
    RAISE EXCEPTION 'An issued invoice cannot be edited';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;
CREATE TRIGGER invoices_guard_update BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION app.guard_invoice_update();
CREATE OR REPLACE FUNCTION app.block_invoice_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Invoices cannot be deleted'; END; $$;
CREATE TRIGGER invoices_block_delete BEFORE DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION app.block_invoice_delete();
CREATE TRIGGER invoices_audit AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('invoice');

-- Issue an invoice -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_invoice(_sale_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;
REVOKE ALL ON FUNCTION public.issue_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_invoice(_invoice_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT app.is_admin(auth.uid()) OR NOT app.is_active_user(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: only Admin can cancel invoices';
  END IF;
  IF NULLIF(btrim(_reason), '') IS NULL THEN RAISE EXCEPTION 'A reason is required to cancel an invoice'; END IF;
  UPDATE public.invoices SET status = 'cancelled', cancel_reason = left(btrim(_reason), 500),
    cancelled_at = now(), cancelled_by = auth.uid()
    WHERE id = _invoice_id AND status = 'issued';
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found or already cancelled'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.cancel_invoice(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid, text) TO authenticated, service_role;

-- Company logo storage policies ---------------------------------------------
CREATE POLICY "Signed-in users can read company assets" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'company-assets');
CREATE POLICY "Admins can upload company assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'company-assets' AND app.is_admin(auth.uid()));
CREATE POLICY "Admins can replace company assets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'company-assets' AND app.is_admin(auth.uid()));