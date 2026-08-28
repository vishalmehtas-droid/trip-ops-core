-- 1. Status enum
CREATE TYPE public.sale_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');

-- 2. Table
CREATE TABLE public.sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  destination_id uuid REFERENCES public.destinations(id),
  booking_date date NOT NULL DEFAULT CURRENT_DATE,
  travel_date date,
  status public.sale_status NOT NULL DEFAULT 'pending',
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_travel_after_booking CHECK (travel_date IS NULL OR travel_date >= booking_date)
);

CREATE INDEX sales_client_id_idx ON public.sales (client_id);
CREATE INDEX sales_destination_id_idx ON public.sales (destination_id);
CREATE INDEX sales_status_idx ON public.sales (status);
CREATE INDEX sales_booking_date_idx ON public.sales (booking_date DESC);
CREATE INDEX sales_created_by_idx ON public.sales (created_by);

-- 3. Grants (no DELETE for application roles: sales are cancelled, never removed)
GRANT SELECT, INSERT, UPDATE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;

-- 4. RLS
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_select_read_permission ON public.sales
  FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.read'));

CREATE POLICY sales_insert_manage ON public.sales
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'sales.manage') AND created_by = auth.uid());

CREATE POLICY sales_update_manage ON public.sales
  FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'sales.manage'));

-- 5. updated_at
CREATE TRIGGER sales_set_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Business + integrity guards
CREATE OR REPLACE FUNCTION app.guard_sale_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_active) THEN
    RAISE EXCEPTION 'A new booking requires an active client';
  END IF;

  IF NEW.destination_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = NEW.destination_id AND d.is_active) THEN
    RAISE EXCEPTION 'A new booking requires an active destination';
  END IF;

  IF NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'New bookings must start as Pending';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.guard_sale_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Historical integrity
  NEW.id := OLD.id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.booking_date := OLD.booking_date;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_active) THEN
    RAISE EXCEPTION 'The selected client must be active';
  END IF;

  IF NEW.destination_id IS DISTINCT FROM OLD.destination_id
     AND NEW.destination_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = NEW.destination_id AND d.is_active) THEN
    RAISE EXCEPTION 'The selected destination must be active';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
      OR (OLD.status = 'confirmed' AND NEW.status IN ('completed', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'A % booking can no longer be edited', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.guard_sale_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.guard_sale_update() FROM PUBLIC;

CREATE TRIGGER sales_guard_insert
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION app.guard_sale_insert();

CREATE TRIGGER sales_guard_update
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION app.guard_sale_update();

-- 7. Trusted audit trail
CREATE OR REPLACE FUNCTION app.audit_sale_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM app.write_audit(
    'sale.created', 'sale', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at'
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.audit_sale_update()
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

  IF _new = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit(
      'sale.status_changed', 'sale', NEW.id::text,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
    _old := _old - 'status';
    _new := _new - 'status';
  END IF;

  IF _new <> '{}'::jsonb THEN
    PERFORM app.write_audit('sale.updated', 'sale', NEW.id::text, _old, _new);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.audit_sale_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.audit_sale_update() FROM PUBLIC;

CREATE TRIGGER sales_audit_insert
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION app.audit_sale_insert();

CREATE TRIGGER sales_audit_update
  AFTER UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION app.audit_sale_update();

-- 8. Permissions
INSERT INTO public.permissions (key, module, description) VALUES
  ('sales.read', 'sales', 'View sales bookings'),
  ('sales.manage', 'sales', 'Create and modify sales bookings')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('admin', 'sales.read'),
  ('admin', 'sales.manage'),
  ('sales', 'sales.read'),
  ('sales', 'sales.manage'),
  ('operations', 'sales.read'),
  ('accounts', 'sales.read'),
  ('viewer', 'sales.read')
ON CONFLICT DO NOTHING;