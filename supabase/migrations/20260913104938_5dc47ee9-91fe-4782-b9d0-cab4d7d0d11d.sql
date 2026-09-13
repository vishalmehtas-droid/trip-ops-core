CREATE TABLE public.vendor_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_types_name_not_blank CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX vendor_types_name_unique_ci ON public.vendor_types (lower(btrim(name)));

GRANT SELECT, INSERT, UPDATE ON public.vendor_types TO authenticated;
GRANT ALL ON public.vendor_types TO service_role;

ALTER TABLE public.vendor_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_types_select_read_permission ON public.vendor_types
  FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'vendors.read'));

CREATE POLICY vendor_types_insert_manage ON public.vendor_types
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'vendors.manage'));

CREATE POLICY vendor_types_update_manage ON public.vendor_types
  FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'vendors.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'vendors.manage'));

REVOKE DELETE, TRUNCATE ON public.vendor_types FROM authenticated, anon;

-- Server-side normalisation so duplicates cannot slip past the unique index.
CREATE OR REPLACE FUNCTION app.normalize_vendor_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.name := btrim(NEW.name);
  IF NEW.name = '' THEN
    RAISE EXCEPTION 'Vendor type name is required';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.normalize_vendor_type() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER vendor_types_normalize
  BEFORE INSERT OR UPDATE ON public.vendor_types
  FOR EACH ROW EXECUTE FUNCTION app.normalize_vendor_type();

CREATE TRIGGER vendor_types_set_updated_at
  BEFORE UPDATE ON public.vendor_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER vendor_types_audit_insert
  AFTER INSERT ON public.vendor_types
  FOR EACH ROW EXECUTE FUNCTION app.audit_master_insert('vendor_type');

CREATE TRIGGER vendor_types_audit_update
  AFTER UPDATE ON public.vendor_types
  FOR EACH ROW EXECUTE FUNCTION app.audit_master_update('vendor_type');

INSERT INTO public.vendor_types (name) VALUES
  ('Hotel'), ('DMC'), ('Car Rental'), ('Flight'), ('Visa'), ('Activity'), ('Other');

-- Move vendors onto the master list.
ALTER TABLE public.vendors
  ADD COLUMN vendor_type_id uuid REFERENCES public.vendor_types(id) ON DELETE RESTRICT;

UPDATE public.vendors v
SET vendor_type_id = t.id
FROM public.vendor_types t
WHERE lower(t.name) = CASE v.type::text
    WHEN 'hotel' THEN 'hotel'
    WHEN 'flight' THEN 'flight'
    WHEN 'visa' THEN 'visa'
    WHEN 'activity' THEN 'activity'
    WHEN 'transport' THEN 'car rental'
    ELSE 'other'
  END;

ALTER TABLE public.vendors ALTER COLUMN vendor_type_id SET NOT NULL;
ALTER TABLE public.vendors DROP COLUMN type;
DROP TYPE public.vendor_type;

CREATE INDEX vendors_vendor_type_id_idx ON public.vendors (vendor_type_id);

-- Newly selected vendor types must be active; historical values stay untouched.
CREATE OR REPLACE FUNCTION app.guard_vendor_type_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.vendor_type_id IS DISTINCT FROM OLD.vendor_type_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vendor_types
      WHERE id = NEW.vendor_type_id AND is_active
    ) THEN
      RAISE EXCEPTION 'The selected vendor type is not active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.guard_vendor_type_reference() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER vendors_guard_vendor_type
  BEFORE INSERT OR UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION app.guard_vendor_type_reference();