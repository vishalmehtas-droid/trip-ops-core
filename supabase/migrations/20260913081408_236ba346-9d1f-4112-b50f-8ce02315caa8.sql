-- ============================================================
-- Phase 2B-3: booking costing & pricing
-- ============================================================

CREATE TYPE public.sale_cost_type AS ENUM ('hotel','flight','visa','activity','transport','dmc','other');
CREATE TYPE public.cost_source_type AS ENUM ('direct','vendor','dmc','other');
CREATE TYPE public.markup_type AS ENUM ('percentage','lumpsum','none');
CREATE TYPE public.billing_type AS ENUM ('tour_package','standalone_service');

ALTER TABLE public.sales
  ADD COLUMN billing_type public.billing_type NOT NULL DEFAULT 'tour_package';

-- ------------------------------------------------------------
-- A. Internal expected procurement costs
-- ------------------------------------------------------------
CREATE TABLE public.sale_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  vendor_id UUID REFERENCES public.vendors(id) ON DELETE RESTRICT,
  cost_type public.sale_cost_type NOT NULL,
  source_type public.cost_source_type NOT NULL DEFAULT 'vendor',
  description TEXT NOT NULL CHECK (btrim(description) <> ''),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'INR' CHECK (currency_code ~ '^[A-Z]{3}$'),
  exchange_rate NUMERIC(14,6) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  base_currency_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sale_costs_sale_idx ON public.sale_costs (sale_id, sort_order, created_at);
CREATE INDEX sale_costs_vendor_idx ON public.sale_costs (vendor_id) WHERE vendor_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_costs TO authenticated;
GRANT ALL ON public.sale_costs TO service_role;
ALTER TABLE public.sale_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sale_costs_select" ON public.sale_costs FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.read'));
CREATE POLICY "sale_costs_insert" ON public.sale_costs FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'sales.manage') AND app.sale_is_editable(sale_id));
CREATE POLICY "sale_costs_update" ON public.sale_costs FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.manage') AND app.sale_is_editable(sale_id))
  WITH CHECK (app.has_permission(auth.uid(), 'sales.manage') AND app.sale_is_editable(sale_id));
CREATE POLICY "sale_costs_delete" ON public.sale_costs FOR DELETE TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.manage') AND app.sale_is_editable(sale_id));

-- ------------------------------------------------------------
-- C. Booking pricing (one row per booking)
-- ------------------------------------------------------------
CREATE TABLE public.sale_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE RESTRICT,
  markup_type public.markup_type NOT NULL DEFAULT 'none',
  markup_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (markup_value >= 0),
  markup_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  selling_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  service_charge_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 5,
  gst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tcs_applicable BOOLEAN NOT NULL DEFAULT false,
  tcs_rate NUMERIC(5,2) CHECK (tcs_rate IS NULL OR (tcs_rate >= 0 AND tcs_rate <= 100)),
  tcs_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  customer_payable NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_gross_profit NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.sale_pricing TO authenticated;
GRANT ALL ON public.sale_pricing TO service_role;
ALTER TABLE public.sale_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sale_pricing_select" ON public.sale_pricing FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.read'));
CREATE POLICY "sale_pricing_update" ON public.sale_pricing FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.manage') AND app.sale_is_editable(sale_id))
  WITH CHECK (app.has_permission(auth.uid(), 'sales.manage') AND app.sale_is_editable(sale_id));
-- No INSERT/DELETE policy: rows are created and removed only by trusted triggers.

-- ------------------------------------------------------------
-- Authoritative cost line calculation
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.compute_sale_cost()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.guard_sale_cost_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.guard_sale_cost_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.guard_sale_cost_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT app.sale_is_editable(OLD.sale_id) THEN
    RAISE EXCEPTION 'Costs can only be removed while the booking is pending or confirmed';
  END IF;
  RETURN OLD;
END;
$$;

-- ------------------------------------------------------------
-- Authoritative pricing calculation (D, E, F)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.compute_sale_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _billing public.billing_type;
  _cost numeric(14,2);
  _charge numeric(14,2);
  _selling numeric(14,2);
  _gst numeric(14,2);
  _tcs numeric(14,2);
BEGIN
  SELECT billing_type INTO _billing FROM public.sales WHERE id = NEW.sale_id;
  IF _billing IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT COALESCE(round(SUM(base_currency_cost), 2), 0)
    INTO _cost
    FROM public.sale_costs
   WHERE sale_id = NEW.sale_id;

  _charge := CASE NEW.markup_type
    WHEN 'percentage' THEN round(_cost * NEW.markup_value / 100, 2)
    WHEN 'lumpsum' THEN round(NEW.markup_value, 2)
    ELSE 0
  END;

  _selling := round(_cost + _charge - NEW.discount_amount, 2);
  IF _selling < 0 THEN
    RAISE EXCEPTION 'The discount cannot exceed the selling value';
  END IF;

  IF _billing = 'tour_package' THEN
    NEW.gst_rate := 5;
    _gst := round(_selling * 5 / 100, 2);
  ELSE
    NEW.gst_rate := 18;
    -- Standalone services are taxed on the service charge only, never on pass-through cost.
    _gst := round(_charge * 18 / 100, 2);
  END IF;

  IF NEW.tcs_applicable THEN
    NEW.tcs_rate := COALESCE(NEW.tcs_rate, 2.00);
    -- Isolated so the statutory base can change later without a data model change.
    _tcs := round((_selling + _gst) * NEW.tcs_rate / 100, 2);
  ELSE
    NEW.tcs_rate := NULL;
    _tcs := 0;
  END IF;

  NEW.markup_amount := _charge;
  NEW.service_charge_amount := _charge;
  NEW.selling_value := _selling;
  NEW.gst_amount := _gst;
  NEW.tcs_amount := _tcs;
  NEW.customer_payable := round(_selling + _gst + _tcs, 2);
  NEW.expected_cost := _cost;
  -- TCS is a collection on behalf of the government and never part of profit.
  NEW.expected_gross_profit := round(_selling - _cost, 2);

  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id;
    NEW.sale_id := OLD.sale_id;
    NEW.created_at := OLD.created_at;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sale_pricing_compute
  BEFORE INSERT OR UPDATE ON public.sale_pricing
  FOR EACH ROW EXECUTE FUNCTION app.compute_sale_pricing();

CREATE TRIGGER sale_pricing_set_updated_at
  BEFORE UPDATE ON public.sale_pricing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Recalculate pricing whenever the cost basis or billing type changes.
CREATE OR REPLACE FUNCTION app.recalculate_sale_pricing(_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.sale_pricing (sale_id) VALUES (_sale_id)
  ON CONFLICT (sale_id) DO UPDATE SET updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION app.recalculate_sale_pricing(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.sync_sale_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _sale_id uuid := COALESCE(NEW.sale_id, OLD.sale_id);
BEGIN
  PERFORM app.recalculate_sale_pricing(_sale_id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.sync_sale_pricing_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM app.recalculate_sale_pricing(NEW.id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER sales_create_pricing
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION app.sync_sale_pricing_on_sale();

CREATE TRIGGER sales_billing_type_recalc
  AFTER UPDATE OF billing_type ON public.sales
  FOR EACH ROW WHEN (NEW.billing_type IS DISTINCT FROM OLD.billing_type)
  EXECUTE FUNCTION app.sync_sale_pricing_on_sale();

-- ------------------------------------------------------------
-- I. Audit (trusted, SECURITY DEFINER only)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.audit_sale_cost_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM app.write_audit('sale_cost.created', 'sale_cost', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at');
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.audit_sale_cost_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.audit_sale_cost_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM app.write_audit('sale_cost.deleted', 'sale_cost', OLD.id::text,
    to_jsonb(OLD) - 'created_at' - 'updated_at', NULL);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.audit_sale_pricing_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE TRIGGER sale_costs_compute BEFORE INSERT OR UPDATE ON public.sale_costs
  FOR EACH ROW EXECUTE FUNCTION app.compute_sale_cost();
CREATE TRIGGER sale_costs_guard_insert BEFORE INSERT ON public.sale_costs
  FOR EACH ROW EXECUTE FUNCTION app.guard_sale_cost_insert();
CREATE TRIGGER sale_costs_guard_update BEFORE UPDATE ON public.sale_costs
  FOR EACH ROW EXECUTE FUNCTION app.guard_sale_cost_update();
CREATE TRIGGER sale_costs_guard_delete BEFORE DELETE ON public.sale_costs
  FOR EACH ROW EXECUTE FUNCTION app.guard_sale_cost_delete();
CREATE TRIGGER sale_costs_set_updated_at BEFORE UPDATE ON public.sale_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sale_costs_audit_insert AFTER INSERT ON public.sale_costs
  FOR EACH ROW EXECUTE FUNCTION app.audit_sale_cost_insert();
CREATE TRIGGER sale_costs_audit_update AFTER UPDATE ON public.sale_costs
  FOR EACH ROW EXECUTE FUNCTION app.audit_sale_cost_update();
CREATE TRIGGER sale_costs_audit_delete AFTER DELETE ON public.sale_costs
  FOR EACH ROW EXECUTE FUNCTION app.audit_sale_cost_delete();
CREATE TRIGGER sale_costs_sync_pricing AFTER INSERT OR UPDATE OR DELETE ON public.sale_costs
  FOR EACH ROW EXECUTE FUNCTION app.sync_sale_pricing();
CREATE TRIGGER sale_pricing_audit_update AFTER UPDATE ON public.sale_pricing
  FOR EACH ROW EXECUTE FUNCTION app.audit_sale_pricing_update();

-- Hard deletes of pricing rows are never allowed through the API.
REVOKE DELETE, TRUNCATE ON public.sale_pricing FROM authenticated, anon;
REVOKE TRUNCATE ON public.sale_costs FROM authenticated, anon;

-- Backfill a pricing row for every existing booking.
INSERT INTO public.sale_pricing (sale_id)
SELECT id FROM public.sales
ON CONFLICT (sale_id) DO NOTHING;