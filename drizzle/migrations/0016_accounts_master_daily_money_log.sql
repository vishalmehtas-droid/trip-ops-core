-- Permissions ---------------------------------------------------------------
INSERT INTO public.permissions (key, module, description) VALUES
  ('accounts.read', 'accounts', 'View money accounts, balances and statements'),
  ('accounts.manage', 'accounts', 'Manage money accounts and other transactions'),
  ('payments.enter', 'payments', 'Enter new vendor payments (daily entry)'),
  ('receipts.enter_own', 'receipts', 'Enter own customer receipts (daily entry)')
ON CONFLICT (key) DO NOTHING;
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('admin','accounts.read'),('accounts','accounts.read'),
  ('admin','accounts.manage'),('accounts','accounts.manage'),
  ('operations','payments.enter'),('sales','receipts.enter_own')
ON CONFLICT DO NOTHING;

-- Accounts master -------------------------------------------------------------
CREATE TABLE public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 120),
  account_type text NOT NULL CHECK (account_type IN ('bank','credit_card','cash','upi_wallet')),
  last4 text CHECK (last4 IS NULL OR last4 ~ '^[0-9]{4}$'),
  opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  opening_balance_date date NOT NULL DEFAULT current_date,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounts_name_unique ON public.accounts (lower(btrim(name)));
GRANT SELECT, INSERT, UPDATE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_select ON public.accounts FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'accounts.read'));
CREATE POLICY accounts_insert ON public.accounts FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'accounts.manage'));
CREATE POLICY accounts_update ON public.accounts FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'accounts.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'accounts.manage'));

INSERT INTO public.accounts (id, name, account_type, opening_balance, opening_balance_date, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Unassigned', 'cash', 0, '2000-01-01', false);

CREATE OR REPLACE FUNCTION app.guard_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;
CREATE TRIGGER accounts_a_guard BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION app.guard_account();
CREATE TRIGGER accounts_set_updated_at BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER accounts_audit AFTER INSERT OR UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('account');

-- Account, cleared flags on payments and receipts --------------------------------
ALTER TABLE public.vendor_payments
  ADD COLUMN account_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.accounts(id),
  ADD COLUMN cleared boolean NOT NULL DEFAULT false,
  ADD COLUMN cleared_on date;
ALTER TABLE public.customer_receipts
  ADD COLUMN account_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.accounts(id),
  ADD COLUMN cleared boolean NOT NULL DEFAULT false,
  ADD COLUMN cleared_on date,
  ADD COLUMN client_id uuid REFERENCES public.clients(id);
CREATE INDEX vendor_payments_account_idx ON public.vendor_payments(account_id);
CREATE INDEX customer_receipts_account_idx ON public.customer_receipts(account_id);
CREATE INDEX customer_receipts_client_idx ON public.customer_receipts(client_id);

UPDATE public.customer_receipts r SET client_id = s.client_id FROM public.sales s WHERE s.id = r.sale_id;
ALTER TABLE public.customer_receipts ALTER COLUMN sale_id DROP NOT NULL;
ALTER TABLE public.customer_receipts ADD CONSTRAINT customer_receipts_client_required CHECK (client_id IS NOT NULL);

-- Shared account / cleared guard (runs after the main guards).
CREATE OR REPLACE FUNCTION app.guard_money_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;
CREATE TRIGGER vendor_payments_b_account BEFORE INSERT OR UPDATE ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION app.guard_money_account();
CREATE TRIGGER customer_receipts_b_account BEFORE INSERT OR UPDATE ON public.customer_receipts
  FOR EACH ROW EXECUTE FUNCTION app.guard_money_account();

-- Daily-entry permissions: Operations may enter Paid, Sales may enter own Received.
DROP POLICY IF EXISTS vendor_payments_insert ON public.vendor_payments;
CREATE POLICY vendor_payments_insert ON public.vendor_payments FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'payments.manage') OR app.has_permission(auth.uid(), 'payments.enter'));
DROP POLICY IF EXISTS customer_receipts_insert ON public.customer_receipts;
CREATE POLICY customer_receipts_insert ON public.customer_receipts FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'receipts.manage') OR app.has_permission(auth.uid(), 'receipts.enter_own'));

CREATE OR REPLACE FUNCTION app.vendor_payment_is_own_recorded(_payment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.vendor_payments WHERE id = _payment_id AND status = 'recorded' AND created_by = auth.uid());
$$;
REVOKE ALL ON FUNCTION app.vendor_payment_is_own_recorded(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.vendor_payment_is_own_recorded(uuid) TO authenticated, service_role;
DROP POLICY IF EXISTS vpa_insert ON public.vendor_payment_allocations;
CREATE POLICY vpa_insert ON public.vendor_payment_allocations FOR INSERT TO authenticated
  WITH CHECK (
    (app.has_permission(auth.uid(), 'payments.manage') AND app.vendor_payment_is_recorded(payment_id))
    OR (app.has_permission(auth.uid(), 'payments.enter') AND app.vendor_payment_is_own_recorded(payment_id)));

-- Customer receipt allocations (advances linked to bookings) ----------------------
CREATE TABLE public.customer_receipt_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.customer_receipts(id),
  sale_id uuid NOT NULL REFERENCES public.sales(id),
  amount_inr numeric(14,2) NOT NULL CHECK (amount_inr > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_receipt_allocations_unique UNIQUE (receipt_id, sale_id)
);
CREATE INDEX customer_receipt_allocations_sale_idx ON public.customer_receipt_allocations(sale_id);
GRANT SELECT, INSERT, DELETE ON public.customer_receipt_allocations TO authenticated;
GRANT ALL ON public.customer_receipt_allocations TO service_role;
ALTER TABLE public.customer_receipt_allocations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.customer_receipt_is_recorded(_receipt_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.customer_receipts WHERE id = _receipt_id AND status = 'recorded');
$$;
REVOKE ALL ON FUNCTION app.customer_receipt_is_recorded(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.customer_receipt_is_recorded(uuid) TO authenticated, service_role;

CREATE POLICY cra_select ON public.customer_receipt_allocations FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'receipts.read'));
CREATE POLICY cra_insert ON public.customer_receipt_allocations FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'receipts.manage') AND app.customer_receipt_is_recorded(receipt_id));
CREATE POLICY cra_delete ON public.customer_receipt_allocations FOR DELETE TO authenticated
  USING (app.has_permission(auth.uid(), 'receipts.manage') AND app.customer_receipt_is_recorded(receipt_id));

CREATE OR REPLACE FUNCTION app.receipt_allocated(_receipt_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(sum(amount_inr), 0) FROM public.customer_receipt_allocations WHERE receipt_id = _receipt_id;
$$;
REVOKE ALL ON FUNCTION app.receipt_allocated(uuid) FROM PUBLIC;

-- Booking cap now counts direct receipts plus linked advances.
CREATE OR REPLACE FUNCTION app.check_receipt_total(_sale_id uuid, _exclude uuid, _amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION app.guard_customer_receipt_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;

CREATE OR REPLACE FUNCTION app.guard_customer_receipt_allocation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;
CREATE TRIGGER cra_a_guard BEFORE INSERT ON public.customer_receipt_allocations
  FOR EACH ROW EXECUTE FUNCTION app.guard_customer_receipt_allocation();
CREATE TRIGGER cra_audit AFTER INSERT OR DELETE ON public.customer_receipt_allocations
  FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('customer_receipt_allocation');

CREATE OR REPLACE FUNCTION public.link_receipt_allocations(_receipt_id uuid, _allocations jsonb)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE _a record;
BEGIN
  DELETE FROM public.customer_receipt_allocations WHERE receipt_id = _receipt_id;
  FOR _a IN SELECT * FROM jsonb_to_recordset(COALESCE(_allocations,'[]'::jsonb)) AS x(sale_id uuid, amount_inr numeric) LOOP
    IF _a.amount_inr IS NOT NULL AND _a.amount_inr > 0 THEN
      INSERT INTO public.customer_receipt_allocations (receipt_id, sale_id, amount_inr)
      VALUES (_receipt_id, _a.sale_id, _a.amount_inr);
    END IF;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.link_receipt_allocations(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_receipt_allocations(uuid, jsonb) TO authenticated;

-- Vendor payment save now carries the account.
CREATE OR REPLACE FUNCTION public.save_vendor_payment(_id uuid, _values jsonb, _allocations jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public' AS $$
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
END; $$;
REVOKE ALL ON FUNCTION public.save_vendor_payment(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_vendor_payment(uuid, jsonb, jsonb) TO authenticated;

-- Other transactions -----------------------------------------------------------
CREATE SEQUENCE public.other_transaction_number_seq;
GRANT USAGE ON SEQUENCE public.other_transaction_number_seq TO service_role;

CREATE TABLE public.other_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number text NOT NULL DEFAULT '' UNIQUE,
  txn_type text NOT NULL CHECK (txn_type IN ('expense','income','transfer')),
  txn_date date NOT NULL DEFAULT current_date,
  amount_inr numeric(14,2) NOT NULL CHECK (amount_inr > 0),
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  to_account_id uuid REFERENCES public.accounts(id),
  category text CHECK (category IS NULL OR char_length(category) <= 80),
  party text CHECK (party IS NULL OR char_length(party) <= 200),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 2000),
  reference text CHECK (reference IS NULL OR char_length(reference) <= 200),
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','cancelled')),
  cancel_reason text,
  cleared boolean NOT NULL DEFAULT false,
  cleared_on date,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT other_transactions_transfer_accounts CHECK (
    (txn_type = 'transfer' AND to_account_id IS NOT NULL AND to_account_id <> account_id)
    OR (txn_type <> 'transfer' AND to_account_id IS NULL)),
  CONSTRAINT other_transactions_cancel_reason_required CHECK (status <> 'cancelled' OR (cancel_reason IS NOT NULL AND btrim(cancel_reason) <> ''))
);
CREATE INDEX other_transactions_account_idx ON public.other_transactions(account_id);
CREATE INDEX other_transactions_to_account_idx ON public.other_transactions(to_account_id);
CREATE INDEX other_transactions_date_idx ON public.other_transactions(txn_date);
GRANT SELECT, INSERT, UPDATE ON public.other_transactions TO authenticated;
GRANT ALL ON public.other_transactions TO service_role;
ALTER TABLE public.other_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY other_transactions_select ON public.other_transactions FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'accounts.read'));
CREATE POLICY other_transactions_insert ON public.other_transactions FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'accounts.manage'));
CREATE POLICY other_transactions_update ON public.other_transactions FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'accounts.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'accounts.manage'));

CREATE OR REPLACE FUNCTION app.guard_other_transaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;
CREATE TRIGGER other_transactions_a_guard BEFORE INSERT OR UPDATE ON public.other_transactions
  FOR EACH ROW EXECUTE FUNCTION app.guard_other_transaction();
CREATE TRIGGER other_transactions_set_updated_at BEFORE UPDATE ON public.other_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER other_transactions_audit AFTER INSERT OR UPDATE ON public.other_transactions
  FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('other_transaction');

-- Account pickers for anyone who can enter money ------------------------------------
CREATE OR REPLACE FUNCTION public.list_selectable_accounts()
RETURNS TABLE (id uuid, name text, account_type text, last4 text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT a.id, a.name, a.account_type, a.last4 FROM public.accounts a
  WHERE a.is_active AND (
    app.has_permission(auth.uid(), 'accounts.read') OR app.has_permission(auth.uid(), 'payments.manage')
    OR app.has_permission(auth.uid(), 'payments.enter') OR app.has_permission(auth.uid(), 'receipts.manage')
    OR app.has_permission(auth.uid(), 'receipts.enter_own'))
  ORDER BY lower(a.name);
$$;
REVOKE ALL ON FUNCTION public.list_selectable_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_selectable_accounts() TO authenticated;

CREATE OR REPLACE FUNCTION public.my_last_account()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT x.account_id FROM (
    SELECT account_id, created_at FROM public.vendor_payments WHERE created_by = auth.uid()
    UNION ALL SELECT account_id, created_at FROM public.customer_receipts WHERE created_by = auth.uid()
    UNION ALL SELECT account_id, created_at FROM public.other_transactions WHERE created_by = auth.uid()
  ) x JOIN public.accounts a ON a.id = x.account_id AND a.is_active
  ORDER BY x.created_at DESC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.my_last_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_last_account() TO authenticated;