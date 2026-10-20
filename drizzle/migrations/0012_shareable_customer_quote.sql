ALTER TABLE public.customer_quotes
  ADD COLUMN public_title text CHECK (char_length(public_title) <= 8000),
  ADD COLUMN summary text CHECK (char_length(summary) <= 8000),
  ADD COLUMN inclusions text CHECK (char_length(inclusions) <= 8000),
  ADD COLUMN exclusions text CHECK (char_length(exclusions) <= 8000),
  ADD COLUMN itinerary text CHECK (char_length(itinerary) <= 8000),
  ADD COLUMN terms text CHECK (char_length(terms) <= 8000),
  ADD COLUMN share_token text NOT NULL
    DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
    CHECK (char_length(share_token) >= 32),
  ADD COLUMN share_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN view_count integer NOT NULL DEFAULT 0,
  ADD COLUMN last_viewed_at timestamptz;
CREATE UNIQUE INDEX customer_quotes_share_token_unique ON public.customer_quotes (share_token);

CREATE OR REPLACE FUNCTION app.guard_customer_quote_insert_share()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.share_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  NEW.share_enabled := false;
  NEW.view_count := 0;
  NEW.last_viewed_at := NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER customer_quotes_guard_insert_share BEFORE INSERT ON public.customer_quotes
  FOR EACH ROW EXECUTE FUNCTION app.guard_customer_quote_insert_share();

CREATE OR REPLACE FUNCTION app.guard_customer_quote_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.audit_customer_quote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

-- Public, token-scoped read. Returns only customer-safe fields and records a view.
CREATE OR REPLACE FUNCTION public.get_shared_customer_quote(_token text, _track boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;
REVOKE ALL ON FUNCTION public.get_shared_customer_quote(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_customer_quote(text, boolean) TO anon, authenticated, service_role;