CREATE TYPE public.supplier_quote_status AS ENUM ('requested','received','selected','rejected');

CREATE SEQUENCE public.supplier_quote_number_seq;
REVOKE ALL ON SEQUENCE public.supplier_quote_number_seq FROM PUBLIC, anon, authenticated;

CREATE TABLE public.supplier_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number text NOT NULL UNIQUE,
  lead_id uuid NOT NULL REFERENCES public.leads(id),
  requirement_id uuid NOT NULL REFERENCES public.travel_requirements(id),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id),
  status public.supplier_quote_status NOT NULL DEFAULT 'requested',
  valid_until date,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_quotes_requirement_idx ON public.supplier_quotes (requirement_id);
CREATE INDEX supplier_quotes_vendor_idx ON public.supplier_quotes (vendor_id);

GRANT SELECT, INSERT, UPDATE ON public.supplier_quotes TO authenticated;
GRANT ALL ON public.supplier_quotes TO service_role;
ALTER TABLE public.supplier_quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_quotes_select_read ON public.supplier_quotes
  FOR SELECT TO authenticated USING (app.has_permission(auth.uid(), 'leads.read'));
CREATE POLICY supplier_quotes_insert_manage ON public.supplier_quotes
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage') AND created_by = auth.uid());
CREATE POLICY supplier_quotes_update_manage ON public.supplier_quotes
  FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'));

CREATE TABLE public.supplier_quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_quote_id uuid NOT NULL REFERENCES public.supplier_quotes(id),
  is_package boolean NOT NULL DEFAULT false,
  purchase_type public.sale_item_type NOT NULL,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  currency text NOT NULL DEFAULT 'INR',
  unit_amount numeric(14,2) NOT NULL CHECK (unit_amount >= 0),
  exchange_rate numeric NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  amount_inr numeric(14,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_quote_lines_quote_idx ON public.supplier_quote_lines (supplier_quote_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_quote_lines TO authenticated;
GRANT ALL ON public.supplier_quote_lines TO service_role;
ALTER TABLE public.supplier_quote_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY sql_select_read ON public.supplier_quote_lines
  FOR SELECT TO authenticated USING (app.has_permission(auth.uid(), 'leads.read'));
CREATE POLICY sql_insert_manage ON public.supplier_quote_lines
  FOR INSERT TO authenticated WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'));
CREATE POLICY sql_update_manage ON public.supplier_quote_lines
  FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'));
CREATE POLICY sql_delete_manage ON public.supplier_quote_lines
  FOR DELETE TO authenticated USING (app.has_permission(auth.uid(), 'leads.manage'));

-- Guards
CREATE OR REPLACE FUNCTION app.guard_supplier_quote_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.quote_number := 'SQ-' || to_char(nextval('public.supplier_quote_number_seq'), 'FM000000');
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status := 'requested';
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
$$;

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.quote_number := OLD.quote_number;
  NEW.lead_id := OLD.lead_id;
  NEW.requirement_id := OLD.requirement_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
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
  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'Vendor is inactive or does not exist';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _quote uuid;
BEGIN
  _quote := CASE WHEN TG_OP = 'DELETE' THEN OLD.supplier_quote_id ELSE NEW.supplier_quote_id END;
  IF TG_OP = 'UPDATE' AND NEW.supplier_quote_id IS DISTINCT FROM OLD.supplier_quote_id THEN
    RAISE EXCEPTION 'Lines cannot be moved between quotes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supplier_quotes
                 WHERE id = _quote AND status IN ('requested','received')) THEN
    RAISE EXCEPTION 'Lines cannot be changed once the quote is selected or rejected';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' THEN NEW.created_at := OLD.created_at; ELSE NEW.created_at := now(); END IF;
  NEW.currency := upper(btrim(NEW.currency));
  IF NEW.currency = 'INR' THEN NEW.exchange_rate := 1; END IF;
  NEW.amount_inr := round(NEW.quantity::numeric * NEW.unit_amount * NEW.exchange_rate, 2);
  RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_quotes_guard_insert BEFORE INSERT ON public.supplier_quotes
  FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_quote_insert();
CREATE TRIGGER supplier_quotes_guard_update BEFORE UPDATE ON public.supplier_quotes
  FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_quote_update();
CREATE TRIGGER supplier_quotes_set_updated_at BEFORE UPDATE ON public.supplier_quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER supplier_quote_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_quote_lines
  FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_quote_line();
CREATE TRIGGER supplier_quote_lines_set_updated_at BEFORE UPDATE ON public.supplier_quote_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit
CREATE OR REPLACE FUNCTION app.audit_supplier_quote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.audit_supplier_quote_line()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE TRIGGER supplier_quotes_audit AFTER INSERT OR UPDATE ON public.supplier_quotes
  FOR EACH ROW EXECUTE FUNCTION app.audit_supplier_quote();
CREATE TRIGGER supplier_quote_lines_audit AFTER INSERT OR UPDATE OR DELETE ON public.supplier_quote_lines
  FOR EACH ROW EXECUTE FUNCTION app.audit_supplier_quote_line();