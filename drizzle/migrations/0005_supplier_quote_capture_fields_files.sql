ALTER TYPE public.sale_item_type ADD VALUE IF NOT EXISTS 'land_package';
ALTER TYPE public.sale_item_type ADD VALUE IF NOT EXISTS 'full_package';
-- Lets accepted quotes with the new types convert into booking cost rows.
ALTER TYPE public.sale_cost_type ADD VALUE IF NOT EXISTS 'land_package';
ALTER TYPE public.sale_cost_type ADD VALUE IF NOT EXISTS 'full_package';

ALTER TABLE public.supplier_quotes
  ADD COLUMN adults integer CHECK (adults IS NULL OR adults BETWEEN 0 AND 999),
  ADD COLUMN children integer CHECK (children IS NULL OR children BETWEEN 0 AND 999),
  ADD COLUMN child_ages text CHECK (child_ages IS NULL OR char_length(child_ages) <= 8000),
  ADD COLUMN inclusions text CHECK (inclusions IS NULL OR char_length(inclusions) <= 8000),
  ADD COLUMN exclusions text CHECK (exclusions IS NULL OR char_length(exclusions) <= 8000),
  ADD COLUMN itinerary_notes text CHECK (itinerary_notes IS NULL OR char_length(itinerary_notes) <= 8000);

ALTER TABLE public.supplier_quote_lines
  ADD COLUMN price_basis text NOT NULL DEFAULT 'total'
    CHECK (price_basis IN ('per_person','per_room','total')),
  ADD COLUMN option_label text CHECK (option_label IS NULL OR char_length(option_label) <= 200),
  ADD COLUMN not_in_total boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.supplier_quote_lines.is_package IS 'DEPRECATED: package lines are derived from purchase_type (land_package, full_package)';

-- Superseding freezes the new header fields too.
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
    NEW.adults := OLD.adults;
    NEW.children := OLD.children;
    NEW.child_ages := OLD.child_ages;
    NEW.inclusions := OLD.inclusions;
    NEW.exclusions := OLD.exclusions;
    NEW.itinerary_notes := OLD.itinerary_notes;
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

-- Revisions copy the new header and line fields; files are not copied.
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
     revision_number, previous_quote_id, adults, children, child_ages, inclusions,
     exclusions, itinerary_notes)
  VALUES ('pending', _old.lead_id, _old.requirement_id, _old.vendor_id, _old.valid_until,
     _old.notes, auth.uid(), _old.revision_number + 1, _old.id, _old.adults, _old.children,
     _old.child_ages, _old.inclusions, _old.exclusions, _old.itinerary_notes)
  RETURNING id INTO _new;
  INSERT INTO public.supplier_quote_lines
    (supplier_quote_id, is_package, purchase_type, description, quantity, currency,
     unit_amount, exchange_rate, sort_order, price_basis, option_label, not_in_total)
  SELECT _new, is_package, purchase_type, description, quantity, currency,
     unit_amount, exchange_rate, sort_order, price_basis, option_label, not_in_total
  FROM public.supplier_quote_lines WHERE supplier_quote_id = _old.id;
  UPDATE public.supplier_quotes SET is_superseded = true WHERE id = _old.id;
  PERFORM set_config('app.sq_revision', 'off', true);
  RETURN _new;
END;
$$;
REVOKE ALL ON FUNCTION public.create_supplier_quote_revision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_supplier_quote_revision(uuid) TO authenticated;

-- Attached files
CREATE TABLE public.supplier_quote_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_quote_id uuid NOT NULL REFERENCES public.supplier_quotes(id) ON DELETE RESTRICT,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 255),
  storage_path text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN
    ('application/pdf','image/png','image/jpeg','image/webp','text/plain','message/rfc822')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supplier_quote_files_quote_idx ON public.supplier_quote_files (supplier_quote_id);
GRANT SELECT, INSERT ON public.supplier_quote_files TO authenticated;
GRANT ALL ON public.supplier_quote_files TO service_role;
ALTER TABLE public.supplier_quote_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Readers can view supplier quote files" ON public.supplier_quote_files
  FOR SELECT TO authenticated USING (app.has_permission(auth.uid(), 'leads.read'));
CREATE POLICY "Managers can attach supplier quote files" ON public.supplier_quote_files
  FOR INSERT TO authenticated WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'));

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_file()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Supplier quote files cannot be changed or deleted'; END IF;
  NEW.uploaded_by := auth.uid();
  NEW.created_at := now();
  IF NEW.uploaded_by IS NULL OR NOT app.is_active_user(NEW.uploaded_by) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF split_part(NEW.storage_path, '/', 1) <> NEW.supplier_quote_id::text THEN
    RAISE EXCEPTION 'File path does not belong to this quote';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects
                 WHERE bucket_id = 'supplier-quote-files' AND name = NEW.storage_path) THEN
    RAISE EXCEPTION 'Uploaded file not found';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER supplier_quote_files_guard BEFORE INSERT OR UPDATE OR DELETE ON public.supplier_quote_files
  FOR EACH ROW EXECUTE FUNCTION app.guard_supplier_quote_file();

CREATE OR REPLACE FUNCTION app.audit_supplier_quote_file()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM app.write_audit('supplier_quote.file_uploaded', 'supplier_quote',
    NEW.supplier_quote_id::text, NULL, to_jsonb(NEW) - 'created_at');
  RETURN NULL;
END;
$$;
CREATE TRIGGER supplier_quote_files_audit AFTER INSERT ON public.supplier_quote_files
  FOR EACH ROW EXECUTE FUNCTION app.audit_supplier_quote_file();

-- Storage: read for leads.read, upload for leads.manage, no update/delete.
CREATE POLICY "Readers can open supplier quote files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'supplier-quote-files' AND app.has_permission(auth.uid(), 'leads.read'));
CREATE POLICY "Managers can upload supplier quote files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'supplier-quote-files'
    AND app.has_permission(auth.uid(), 'leads.manage')
    AND app.is_active_user(auth.uid())
    AND EXISTS (SELECT 1 FROM public.supplier_quotes q
                WHERE q.id::text = (storage.foldername(name))[1]));