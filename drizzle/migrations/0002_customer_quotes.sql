-- Shared pricing calculation (behaviour identical to the original sales pricing)
CREATE OR REPLACE FUNCTION app.calc_pricing(
  _billing public.billing_type, _cost numeric, _markup_type public.markup_type,
  _markup_value numeric, _discount numeric, _tcs_applicable boolean, _tcs_rate numeric,
  OUT charge numeric, OUT selling numeric, OUT gst_rate numeric, OUT gst numeric,
  OUT tcs_rate numeric, OUT tcs numeric, OUT payable numeric, OUT profit numeric)
LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.compute_sale_pricing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

-- Customer quotes
CREATE TYPE public.customer_quote_status AS ENUM
  ('draft','sent','accepted','rejected','expired','superseded');

CREATE SEQUENCE public.customer_quote_number_seq;
REVOKE ALL ON SEQUENCE public.customer_quote_number_seq FROM PUBLIC, anon, authenticated;

CREATE TABLE public.customer_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text NOT NULL UNIQUE,
  lead_id uuid NOT NULL REFERENCES public.leads(id),
  requirement_id uuid NOT NULL REFERENCES public.travel_requirements(id),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  revision_no integer NOT NULL DEFAULT 1,
  previous_quote_id uuid REFERENCES public.customer_quotes(id),
  status public.customer_quote_status NOT NULL DEFAULT 'draft',
  valid_until date,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_quotes_requirement_idx ON public.customer_quotes (requirement_id);
CREATE INDEX customer_quotes_lead_idx ON public.customer_quotes (lead_id);
CREATE UNIQUE INDEX customer_quotes_previous_unique ON public.customer_quotes (previous_quote_id)
  WHERE previous_quote_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.customer_quotes TO authenticated;
GRANT ALL ON public.customer_quotes TO service_role;
ALTER TABLE public.customer_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_quotes_select_read ON public.customer_quotes
  FOR SELECT TO authenticated USING (app.has_permission(auth.uid(), 'leads.read'));
CREATE POLICY customer_quotes_insert_manage ON public.customer_quotes
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage') AND created_by = auth.uid());
CREATE POLICY customer_quotes_update_manage ON public.customer_quotes
  FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'));

CREATE TABLE public.customer_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_quote_id uuid NOT NULL REFERENCES public.customer_quotes(id),
  source_supplier_quote_line_id uuid REFERENCES public.supplier_quote_lines(id) ON DELETE SET NULL,
  purchase_type public.sale_item_type NOT NULL,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  currency text NOT NULL DEFAULT 'INR',
  expected_cost_inr numeric(14,2) NOT NULL DEFAULT 0 CHECK (expected_cost_inr >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_quote_lines_quote_idx ON public.customer_quote_lines (customer_quote_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_quote_lines TO authenticated;
GRANT ALL ON public.customer_quote_lines TO service_role;
ALTER TABLE public.customer_quote_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY cql_select_read ON public.customer_quote_lines
  FOR SELECT TO authenticated USING (app.has_permission(auth.uid(), 'leads.read'));
CREATE POLICY cql_insert_manage ON public.customer_quote_lines
  FOR INSERT TO authenticated WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'));
CREATE POLICY cql_update_manage ON public.customer_quote_lines
  FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'));
CREATE POLICY cql_delete_manage ON public.customer_quote_lines
  FOR DELETE TO authenticated USING (app.has_permission(auth.uid(), 'leads.manage'));

CREATE TABLE public.customer_quote_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_quote_id uuid NOT NULL UNIQUE REFERENCES public.customer_quotes(id),
  billing_type public.billing_type NOT NULL DEFAULT 'tour_package',
  markup_type public.markup_type NOT NULL DEFAULT 'none',
  markup_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (markup_value >= 0),
  markup_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  selling_value numeric(14,2) NOT NULL DEFAULT 0,
  service_charge_amount numeric(14,2) NOT NULL DEFAULT 0,
  gst_rate numeric(5,2) NOT NULL DEFAULT 5,
  gst_amount numeric(14,2) NOT NULL DEFAULT 0,
  tcs_applicable boolean NOT NULL DEFAULT false,
  tcs_rate numeric(5,2) CHECK (tcs_rate IS NULL OR (tcs_rate >= 0 AND tcs_rate <= 100)),
  tcs_amount numeric(14,2) NOT NULL DEFAULT 0,
  customer_payable numeric(14,2) NOT NULL DEFAULT 0,
  expected_cost numeric(14,2) NOT NULL DEFAULT 0,
  expected_gross_profit numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.customer_quote_pricing TO authenticated;
GRANT ALL ON public.customer_quote_pricing TO service_role;
ALTER TABLE public.customer_quote_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY cqp_select_read ON public.customer_quote_pricing
  FOR SELECT TO authenticated USING (app.has_permission(auth.uid(), 'leads.read'));
CREATE POLICY cqp_update_manage ON public.customer_quote_pricing
  FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'));

-- Guards
CREATE OR REPLACE FUNCTION app.customer_quote_is_draft(_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.customer_quotes WHERE id = _id AND status = 'draft');
$$;

CREATE OR REPLACE FUNCTION app.guard_customer_quote_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.guard_customer_quote_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _rev boolean := COALESCE(current_setting('app.cq_revision', true), '') = 'on';
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
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'superseded' THEN
      IF NOT _rev THEN RAISE EXCEPTION 'Quotes are superseded only by creating a revision'; END IF;
    ELSIF NOT (
      (OLD.status = 'draft' AND NEW.status = 'sent')
      OR (OLD.status = 'sent' AND NEW.status IN ('accepted','rejected','expired'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'A % customer quote can no longer be edited', OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.guard_customer_quote_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.compute_customer_quote_pricing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.create_customer_quote_pricing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.customer_quote_pricing (customer_quote_id) VALUES (NEW.id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.sync_customer_quote_pricing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM set_config('app.cq_recalc', 'on', true);
  UPDATE public.customer_quote_pricing SET markup_type = markup_type
   WHERE customer_quote_id = COALESCE(NEW.customer_quote_id, OLD.customer_quote_id);
  PERFORM set_config('app.cq_recalc', 'off', true);
  RETURN NULL;
END;
$$;

CREATE TRIGGER customer_quotes_guard_insert BEFORE INSERT ON public.customer_quotes
  FOR EACH ROW EXECUTE FUNCTION app.guard_customer_quote_insert();
CREATE TRIGGER customer_quotes_guard_update BEFORE UPDATE ON public.customer_quotes
  FOR EACH ROW EXECUTE FUNCTION app.guard_customer_quote_update();
CREATE TRIGGER customer_quotes_set_updated_at BEFORE UPDATE ON public.customer_quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customer_quotes_create_pricing AFTER INSERT ON public.customer_quotes
  FOR EACH ROW EXECUTE FUNCTION app.create_customer_quote_pricing();
CREATE TRIGGER customer_quote_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.customer_quote_lines
  FOR EACH ROW EXECUTE FUNCTION app.guard_customer_quote_line();
CREATE TRIGGER customer_quote_lines_set_updated_at BEFORE UPDATE ON public.customer_quote_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER customer_quote_lines_sync_pricing AFTER INSERT OR UPDATE OR DELETE ON public.customer_quote_lines
  FOR EACH ROW EXECUTE FUNCTION app.sync_customer_quote_pricing();
CREATE TRIGGER customer_quote_pricing_compute BEFORE INSERT OR UPDATE ON public.customer_quote_pricing
  FOR EACH ROW EXECUTE FUNCTION app.compute_customer_quote_pricing();
CREATE TRIGGER customer_quote_pricing_set_updated_at BEFORE UPDATE ON public.customer_quote_pricing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Revisions
CREATE OR REPLACE FUNCTION public.create_customer_quote_revision(_quote_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
     revision_no, previous_quote_id)
  VALUES ('pending', _old.lead_id, _old.requirement_id, _old.client_id, _old.valid_until,
     _old.notes, auth.uid(), _old.revision_no + 1, _old.id)
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
$$;
REVOKE ALL ON FUNCTION public.create_customer_quote_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_customer_quote_revision(uuid) TO authenticated;

-- Audit
CREATE OR REPLACE FUNCTION app.audit_customer_quote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _old jsonb; _new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app.write_audit('customer_quote.created', 'customer_quote', NEW.id::text, NULL,
      to_jsonb(NEW) - 'created_at' - 'updated_at');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit('customer_quote.status_changed', 'customer_quote', NEW.id::text,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
  ELSE
    _old := to_jsonb(OLD) - 'created_at' - 'updated_at';
    _new := to_jsonb(NEW) - 'created_at' - 'updated_at';
    IF _old IS DISTINCT FROM _new THEN
      PERFORM app.write_audit('customer_quote.updated', 'customer_quote', NEW.id::text, _old, _new);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.audit_customer_quote_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.audit_customer_quote_pricing()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE TRIGGER customer_quotes_audit AFTER INSERT OR UPDATE ON public.customer_quotes
  FOR EACH ROW EXECUTE FUNCTION app.audit_customer_quote();
CREATE TRIGGER customer_quote_lines_audit AFTER INSERT OR UPDATE OR DELETE ON public.customer_quote_lines
  FOR EACH ROW EXECUTE FUNCTION app.audit_customer_quote_line();
CREATE TRIGGER customer_quote_pricing_audit AFTER UPDATE ON public.customer_quote_pricing
  FOR EACH ROW EXECUTE FUNCTION app.audit_customer_quote_pricing();