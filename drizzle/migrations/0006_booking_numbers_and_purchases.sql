-- Booking numbers -----------------------------------------------------------
CREATE SEQUENCE public.booking_number_seq;
ALTER TABLE public.sales ADD COLUMN booking_number text;

ALTER TABLE public.sales DISABLE TRIGGER USER;
UPDATE public.sales s SET booking_number = 'BK-' || lpad(o.rn::text, 6, '0')
FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM public.sales) o
WHERE o.id = s.id;
ALTER TABLE public.sales ENABLE TRIGGER USER;

SELECT setval('public.booking_number_seq', GREATEST((SELECT count(*) FROM public.sales), 1), (SELECT count(*) FROM public.sales) > 0);
ALTER TABLE public.sales ALTER COLUMN booking_number SET NOT NULL;
ALTER TABLE public.sales ADD CONSTRAINT sales_booking_number_key UNIQUE (booking_number);

CREATE OR REPLACE FUNCTION app.assign_booking_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.booking_number := 'BK-' || lpad(nextval('public.booking_number_seq')::text, 6, '0');
  RETURN NEW;
END; $$;
CREATE TRIGGER sales_assign_booking_number BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION app.assign_booking_number();

CREATE OR REPLACE FUNCTION app.guard_sale_booking_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.booking_number := OLD.booking_number;
  RETURN NEW;
END; $$;
CREATE TRIGGER sales_guard_booking_number BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION app.guard_sale_booking_number();

-- Permissions -------------------------------------------------------------
INSERT INTO public.permissions (key, module, description) VALUES
  ('purchases.read', 'purchases', 'View vendor purchases'),
  ('purchases.manage', 'purchases', 'Create, edit and cancel vendor purchases')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('admin','purchases.read'),('sales','purchases.read'),('operations','purchases.read'),
  ('accounts','purchases.read'),('viewer','purchases.read'),
  ('admin','purchases.manage'),('accounts','purchases.manage');

-- Purchases ---------------------------------------------------------------
CREATE SEQUENCE public.purchase_number_seq;

CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_number text NOT NULL UNIQUE,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  vendor_invoice_number text CHECK (vendor_invoice_number IS NULL OR char_length(vendor_invoice_number) <= 100),
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  currency_code text NOT NULL DEFAULT 'INR' CHECK (currency_code ~ '^[A-Z]{3}$'),
  exchange_rate numeric(14,6) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  amount_inr numeric(14,2) NOT NULL DEFAULT 0,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','cancelled')),
  cancel_reason text CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 1000),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchases_cancel_reason_required CHECK (status <> 'cancelled' OR (cancel_reason IS NOT NULL AND btrim(cancel_reason) <> ''))
);
CREATE INDEX purchases_sale_idx ON public.purchases(sale_id);
CREATE INDEX purchases_vendor_idx ON public.purchases(vendor_id);
CREATE INDEX purchases_invoice_date_idx ON public.purchases(invoice_date);

GRANT SELECT, INSERT, UPDATE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
GRANT USAGE ON SEQUENCE public.purchase_number_seq TO service_role;

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchases_select ON public.purchases FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'purchases.read'));
CREATE POLICY purchases_insert ON public.purchases FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'purchases.manage') AND app.sale_is_editable(sale_id));
CREATE POLICY purchases_update ON public.purchases FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'purchases.manage') AND app.sale_is_editable(sale_id))
  WITH CHECK (app.has_permission(auth.uid(), 'purchases.manage') AND app.sale_is_editable(sale_id));

CREATE OR REPLACE FUNCTION app.guard_purchase_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.id := gen_random_uuid();
  NEW.purchase_number := 'PU-' || lpad(nextval('public.purchase_number_seq')::text, 6, '0');
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status := 'recorded';
  NEW.cancel_reason := NULL;
  IF NEW.created_by IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT app.sale_is_editable(NEW.sale_id) THEN
    RAISE EXCEPTION 'Purchases can only be added while the booking is pending or confirmed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION app.guard_purchase_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.purchase_number := OLD.purchase_number;
  NEW.sale_id := OLD.sale_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF NOT app.sale_is_editable(OLD.sale_id) THEN
    RAISE EXCEPTION 'Purchases can only be changed while the booking is pending or confirmed';
  END IF;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled purchase can no longer be changed';
  END IF;
  IF NEW.status = 'cancelled' THEN
    -- Cancelling only records the reason; amounts stay as they were.
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
END; $$;

CREATE OR REPLACE FUNCTION app.compute_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.currency_code := upper(btrim(NEW.currency_code));
  IF NEW.currency_code = 'INR' THEN NEW.exchange_rate := 1; END IF;
  NEW.amount_inr := round(NEW.amount * NEW.exchange_rate, 2);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION app.audit_purchase_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM app.write_audit('purchase.created', 'purchase', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at');
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION app.audit_purchase_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;

CREATE TRIGGER purchases_a_guard_insert BEFORE INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION app.guard_purchase_insert();
CREATE TRIGGER purchases_a_guard_update BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION app.guard_purchase_update();
CREATE TRIGGER purchases_b_compute BEFORE INSERT OR UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION app.compute_purchase();
CREATE TRIGGER purchases_set_updated_at BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER purchases_audit_insert AFTER INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION app.audit_purchase_insert();
CREATE TRIGGER purchases_audit_update AFTER UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION app.audit_purchase_update();