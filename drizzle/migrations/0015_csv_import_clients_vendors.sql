ALTER TABLE public.clients ADD COLUMN city text CHECK (city IS NULL OR char_length(city) <= 120);
ALTER TABLE public.vendors ADD COLUMN city text CHECK (city IS NULL OR char_length(city) <= 120);
ALTER TABLE public.clients ADD COLUMN created_by uuid REFERENCES public.profiles(id) DEFAULT auth.uid();
ALTER TABLE public.vendors ADD COLUMN created_by uuid REFERENCES public.profiles(id) DEFAULT auth.uid();

-- Insert audit now records the import source when one is set for the transaction.
CREATE OR REPLACE FUNCTION app.audit_master_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _entity text := TG_ARGV[0];
  _row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _src text := NULLIF(current_setting('app.import_source', true), '');
BEGIN
  IF _src IS NOT NULL THEN _row := _row || jsonb_build_object('import_source', _src); END IF;
  PERFORM app.write_audit(_entity || '.created', _entity, (_row->>'id'), NULL, _row);
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.import_clients(_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;
REVOKE ALL ON FUNCTION public.import_clients(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_clients(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.import_vendors(_rows jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
END; $$;
REVOKE ALL ON FUNCTION public.import_vendors(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_vendors(jsonb) TO authenticated, service_role;