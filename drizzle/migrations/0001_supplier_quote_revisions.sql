ALTER TABLE public.supplier_quotes
  ADD COLUMN revision_number integer NOT NULL DEFAULT 1,
  ADD COLUMN previous_quote_id uuid REFERENCES public.supplier_quotes(id),
  ADD COLUMN is_superseded boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX supplier_quotes_previous_unique ON public.supplier_quotes (previous_quote_id)
  WHERE previous_quote_id IS NOT NULL;

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.create_supplier_quote_revision(_quote_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
     revision_number, previous_quote_id)
  VALUES ('pending', _old.lead_id, _old.requirement_id, _old.vendor_id, _old.valid_until,
     _old.notes, auth.uid(), _old.revision_number + 1, _old.id)
  RETURNING id INTO _new;
  INSERT INTO public.supplier_quote_lines
    (supplier_quote_id, is_package, purchase_type, description, quantity, currency,
     unit_amount, exchange_rate, sort_order)
  SELECT _new, is_package, purchase_type, description, quantity, currency,
     unit_amount, exchange_rate, sort_order
  FROM public.supplier_quote_lines WHERE supplier_quote_id = _old.id;
  UPDATE public.supplier_quotes SET is_superseded = true WHERE id = _old.id;
  PERFORM set_config('app.sq_revision', 'off', true);
  RETURN _new;
END;
$$;
REVOKE ALL ON FUNCTION public.create_supplier_quote_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_quote_revision(uuid) TO authenticated;