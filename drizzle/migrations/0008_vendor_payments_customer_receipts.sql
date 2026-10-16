-- 0. Purchases: allowed on any booking that is not cancelled -----------------
CREATE OR REPLACE FUNCTION app.sale_accepts_purchases(_sale_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.sales WHERE id = _sale_id AND status <> 'cancelled'::public.sale_status);
$$;
REVOKE ALL ON FUNCTION app.sale_accepts_purchases(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.sale_accepts_purchases(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS purchases_insert ON public.purchases;
DROP POLICY IF EXISTS purchases_update ON public.purchases;
CREATE POLICY purchases_insert ON public.purchases FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'purchases.manage') AND app.sale_accepts_purchases(sale_id));
CREATE POLICY purchases_update ON public.purchases FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'purchases.manage') AND app.sale_accepts_purchases(sale_id))
  WITH CHECK (app.has_permission(auth.uid(), 'purchases.manage') AND app.sale_accepts_purchases(sale_id));

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
  IF NOT app.sale_accepts_purchases(NEW.sale_id) THEN
    RAISE EXCEPTION 'Purchases can''t be added to a cancelled booking';
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
END; $$;

-- Permissions -------------------------------------------------------------
INSERT INTO public.permissions (key, module, description) VALUES
  ('payments.read', 'payments', 'View vendor payments'),
  ('payments.manage', 'payments', 'Create, edit, allocate and cancel vendor payments'),
  ('receipts.read', 'receipts', 'View customer receipts'),
  ('receipts.manage', 'receipts', 'Create, edit and cancel customer receipts')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('admin','payments.read'),('sales','payments.read'),('operations','payments.read'),
  ('accounts','payments.read'),('viewer','payments.read'),
  ('admin','payments.manage'),('accounts','payments.manage'),
  ('admin','receipts.read'),('sales','receipts.read'),('operations','receipts.read'),
  ('accounts','receipts.read'),('viewer','receipts.read'),
  ('admin','receipts.manage'),('accounts','receipts.manage')
ON CONFLICT DO NOTHING;

-- Generic audit helper -----------------------------------------------------
CREATE OR REPLACE FUNCTION app.audit_money_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;

-- PART A: vendor payments ---------------------------------------------------
CREATE SEQUENCE public.vendor_payment_number_seq;
GRANT USAGE ON SEQUENCE public.vendor_payment_number_seq TO service_role;

CREATE TABLE public.vendor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL DEFAULT '' UNIQUE,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  sale_id uuid REFERENCES public.sales(id),
  payment_type text NOT NULL DEFAULT 'part' CHECK (payment_type IN ('advance','part','final')),
  payment_date date NOT NULL DEFAULT current_date,
  amount_inr numeric(14,2) NOT NULL CHECK (amount_inr > 0),
  method text NOT NULL CHECK (method IN ('bank_transfer','upi','cash','cheque','card','other')),
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','cancelled')),
  cancel_reason text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_payments_cancel_reason_required CHECK (status <> 'cancelled' OR (cancel_reason IS NOT NULL AND btrim(cancel_reason) <> ''))
);
CREATE INDEX vendor_payments_vendor_idx ON public.vendor_payments(vendor_id);
CREATE INDEX vendor_payments_sale_idx ON public.vendor_payments(sale_id);
CREATE INDEX vendor_payments_date_idx ON public.vendor_payments(payment_date);

GRANT SELECT, INSERT, UPDATE ON public.vendor_payments TO authenticated;
GRANT ALL ON public.vendor_payments TO service_role;
ALTER TABLE public.vendor_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendor_payments_select ON public.vendor_payments FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'payments.read'));
CREATE POLICY vendor_payments_insert ON public.vendor_payments FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'payments.manage'));
CREATE POLICY vendor_payments_update ON public.vendor_payments FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'payments.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'payments.manage'));

CREATE TABLE public.vendor_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.vendor_payments(id),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id),
  amount_inr numeric(14,2) NOT NULL CHECK (amount_inr > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_payment_allocations_unique UNIQUE (payment_id, purchase_id)
);
CREATE INDEX vendor_payment_allocations_purchase_idx ON public.vendor_payment_allocations(purchase_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_payment_allocations TO authenticated;
GRANT ALL ON public.vendor_payment_allocations TO service_role;
ALTER TABLE public.vendor_payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.vendor_payment_is_recorded(_payment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.vendor_payments WHERE id = _payment_id AND status = 'recorded');
$$;
REVOKE ALL ON FUNCTION app.vendor_payment_is_recorded(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.vendor_payment_is_recorded(uuid) TO authenticated, service_role;

CREATE POLICY vpa_select ON public.vendor_payment_allocations FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'payments.read'));
CREATE POLICY vpa_insert ON public.vendor_payment_allocations FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'payments.manage') AND app.vendor_payment_is_recorded(payment_id));
CREATE POLICY vpa_update ON public.vendor_payment_allocations FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'payments.manage') AND app.vendor_payment_is_recorded(payment_id))
  WITH CHECK (app.has_permission(auth.uid(), 'payments.manage') AND app.vendor_payment_is_recorded(payment_id));
CREATE POLICY vpa_delete ON public.vendor_payment_allocations FOR DELETE TO authenticated
  USING (app.has_permission(auth.uid(), 'payments.manage') AND app.vendor_payment_is_recorded(payment_id));

-- Sum of live allocations (recorded payment and recorded purchase).
CREATE OR REPLACE FUNCTION app.payment_allocated(_payment_id uuid, _exclude uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(sum(a.amount_inr), 0) FROM public.vendor_payment_allocations a
  JOIN public.purchases p ON p.id = a.purchase_id AND p.status = 'recorded'
  WHERE a.payment_id = _payment_id AND (_exclude IS NULL OR a.id <> _exclude);
$$;
CREATE OR REPLACE FUNCTION app.purchase_allocated(_purchase_id uuid, _exclude uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(sum(a.amount_inr), 0) FROM public.vendor_payment_allocations a
  JOIN public.vendor_payments v ON v.id = a.payment_id AND v.status = 'recorded'
  WHERE a.purchase_id = _purchase_id AND (_exclude IS NULL OR a.id <> _exclude);
$$;
REVOKE ALL ON FUNCTION app.payment_allocated(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.purchase_allocated(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.guard_vendor_payment_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION app.guard_vendor_payment_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;

CREATE TRIGGER vendor_payments_a_guard_insert BEFORE INSERT ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION app.guard_vendor_payment_insert();
CREATE TRIGGER vendor_payments_a_guard_update BEFORE UPDATE ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION app.guard_vendor_payment_update();
CREATE TRIGGER vendor_payments_set_updated_at BEFORE UPDATE ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER vendor_payments_audit AFTER INSERT OR UPDATE ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('vendor_payment');

CREATE OR REPLACE FUNCTION app.guard_vendor_payment_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;

CREATE TRIGGER vpa_a_guard BEFORE INSERT OR UPDATE ON public.vendor_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION app.guard_vendor_payment_allocation();
CREATE TRIGGER vpa_set_updated_at BEFORE UPDATE ON public.vendor_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER vpa_audit AFTER INSERT OR UPDATE OR DELETE ON public.vendor_payment_allocations
  FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('vendor_payment_allocation');

-- Keep purchases consistent with their allocations.
CREATE OR REPLACE FUNCTION app.guard_purchase_allocations()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;
CREATE TRIGGER purchases_c_allocation_guard BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION app.guard_purchase_allocations();

-- Atomic create / update with allocations (runs as the caller; RLS applies).
CREATE OR REPLACE FUNCTION public.save_vendor_payment(_id uuid, _values jsonb, _allocations jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE _row public.vendor_payments; _a record;
BEGIN
  IF _id IS NULL THEN
    INSERT INTO public.vendor_payments (vendor_id, sale_id, payment_type, payment_date, amount_inr, method, reference, notes)
    VALUES ((_values->>'vendor_id')::uuid, NULLIF(_values->>'sale_id','')::uuid,
      COALESCE(_values->>'payment_type','part'), COALESCE(NULLIF(_values->>'payment_date','')::date, current_date),
      (_values->>'amount_inr')::numeric, _values->>'method', _values->>'reference', _values->>'notes')
    RETURNING * INTO _row;
  ELSE
    DELETE FROM public.vendor_payment_allocations WHERE payment_id = _id;
    UPDATE public.vendor_payments SET
      vendor_id = (_values->>'vendor_id')::uuid,
      sale_id = NULLIF(_values->>'sale_id','')::uuid,
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
END; $$;
REVOKE ALL ON FUNCTION public.save_vendor_payment(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_vendor_payment(uuid, jsonb, jsonb) TO authenticated;

-- PART B: customer receipts -------------------------------------------------
CREATE SEQUENCE public.customer_receipt_number_seq;
GRANT USAGE ON SEQUENCE public.customer_receipt_number_seq TO service_role;

CREATE TABLE public.customer_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL DEFAULT '' UNIQUE,
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  payment_type text NOT NULL DEFAULT 'part' CHECK (payment_type IN ('advance','part','final')),
  receipt_date date NOT NULL DEFAULT current_date,
  amount_inr numeric(14,2) NOT NULL CHECK (amount_inr > 0),
  method text NOT NULL CHECK (method IN ('bank_transfer','upi','cash','cheque','card','other')),
  reference text,
  notes text,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','cancelled')),
  cancel_reason text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_receipts_cancel_reason_required CHECK (status <> 'cancelled' OR (cancel_reason IS NOT NULL AND btrim(cancel_reason) <> ''))
);
CREATE INDEX customer_receipts_sale_idx ON public.customer_receipts(sale_id);
CREATE INDEX customer_receipts_date_idx ON public.customer_receipts(receipt_date);

GRANT SELECT, INSERT, UPDATE ON public.customer_receipts TO authenticated;
GRANT ALL ON public.customer_receipts TO service_role;
ALTER TABLE public.customer_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_receipts_select ON public.customer_receipts FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'receipts.read'));
CREATE POLICY customer_receipts_insert ON public.customer_receipts FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'receipts.manage'));
CREATE POLICY customer_receipts_update ON public.customer_receipts FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'receipts.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'receipts.manage'));

CREATE OR REPLACE FUNCTION app.check_receipt_total(_sale_id uuid, _exclude uuid, _amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _payable numeric; _received numeric;
BEGIN
  PERFORM 1 FROM public.sales WHERE id = _sale_id FOR UPDATE;
  SELECT customer_payable INTO _payable FROM public.sale_pricing WHERE sale_id = _sale_id;
  SELECT COALESCE(sum(amount_inr), 0) INTO _received FROM public.customer_receipts
    WHERE sale_id = _sale_id AND status = 'recorded' AND (_exclude IS NULL OR id <> _exclude);
  IF _received + _amount > COALESCE(_payable, 0) THEN
    RAISE EXCEPTION 'Receipts would exceed the booking''s customer payable (outstanding %)',
      to_char(GREATEST(COALESCE(_payable,0) - _received, 0), 'FM999999999990.00');
  END IF;
END; $$;
REVOKE ALL ON FUNCTION app.check_receipt_total(uuid, uuid, numeric) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.guard_customer_receipt_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  IF NOT app.sale_accepts_purchases(NEW.sale_id) THEN
    RAISE EXCEPTION 'Receipts can''t be recorded on a cancelled booking';
  END IF;
  PERFORM app.check_receipt_total(NEW.sale_id, NULL, NEW.amount_inr);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION app.guard_customer_receipt_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.receipt_number := OLD.receipt_number;
  NEW.sale_id := OLD.sale_id;
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
  IF NOT app.sale_accepts_purchases(OLD.sale_id) THEN
    RAISE EXCEPTION 'Receipts on a cancelled booking can only be cancelled';
  END IF;
  PERFORM app.check_receipt_total(OLD.sale_id, OLD.id, NEW.amount_inr);
  RETURN NEW;
END; $$;

CREATE TRIGGER customer_receipts_a_guard_insert BEFORE INSERT ON public.customer_receipts
  FOR EACH ROW EXECUTE FUNCTION app.guard_customer_receipt_insert();
CREATE TRIGGER customer_receipts_a_guard_update BEFORE UPDATE ON public.customer_receipts
  FOR EACH ROW EXECUTE FUNCTION app.guard_customer_receipt_update();
CREATE TRIGGER customer_receipts_set_updated_at BEFORE UPDATE ON public.customer_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customer_receipts_audit AFTER INSERT OR UPDATE ON public.customer_receipts
  FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('customer_receipt');