-- ============ ENUM ============
CREATE TYPE public.vendor_type AS ENUM ('hotel', 'flight', 'visa', 'activity', 'transport', 'other');

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  gst_number TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_select_read_permission" ON public.clients FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'clients.read'));
CREATE POLICY "clients_insert_manage" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'clients.manage'));
CREATE POLICY "clients_update_manage" ON public.clients FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'clients.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'clients.manage'));

CREATE INDEX clients_name_idx ON public.clients (lower(name));
CREATE INDEX clients_phone_idx ON public.clients (phone);
CREATE INDEX clients_email_idx ON public.clients (lower(email));
CREATE INDEX clients_active_idx ON public.clients (is_active);

-- ============ VENDORS ============
CREATE TABLE public.vendors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type public.vendor_type NOT NULL,
  phone TEXT,
  email TEXT,
  gst_number TEXT,
  address TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.vendors TO authenticated;
GRANT ALL ON public.vendors TO service_role;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors_select_read_permission" ON public.vendors FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'vendors.read'));
CREATE POLICY "vendors_insert_manage" ON public.vendors FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'vendors.manage'));
CREATE POLICY "vendors_update_manage" ON public.vendors FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'vendors.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'vendors.manage'));

CREATE INDEX vendors_name_idx ON public.vendors (lower(name));
CREATE INDEX vendors_type_idx ON public.vendors (type);
CREATE INDEX vendors_phone_idx ON public.vendors (phone);
CREATE INDEX vendors_email_idx ON public.vendors (lower(email));
CREATE INDEX vendors_active_idx ON public.vendors (is_active);

-- ============ DESTINATIONS ============
CREATE TABLE public.destinations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  region TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.destinations TO authenticated;
GRANT ALL ON public.destinations TO service_role;
ALTER TABLE public.destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "destinations_select_read_permission" ON public.destinations FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'destinations.read'));
CREATE POLICY "destinations_insert_manage" ON public.destinations FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'destinations.manage'));
CREATE POLICY "destinations_update_manage" ON public.destinations FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'destinations.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'destinations.manage'));

CREATE INDEX destinations_name_idx ON public.destinations (lower(name));
CREATE INDEX destinations_country_idx ON public.destinations (lower(country));
CREATE INDEX destinations_region_idx ON public.destinations (lower(region));
CREATE INDEX destinations_active_idx ON public.destinations (is_active);

-- ============ UPDATED_AT ============
CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER vendors_set_updated_at BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER destinations_set_updated_at BEFORE UPDATE ON public.destinations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ TRUSTED AUDIT (generic master-record trigger) ============
CREATE OR REPLACE FUNCTION app.audit_master_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _entity text := TG_ARGV[0];
  _row jsonb := to_jsonb(NEW);
BEGIN
  PERFORM app.write_audit(
    _entity || '.created', _entity, (_row->>'id'), NULL,
    _row - 'created_at' - 'updated_at'
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.audit_master_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _entity text := TG_ARGV[0];
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
  _action text;
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

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    _action := _entity || CASE WHEN NEW.is_active THEN '.activated' ELSE '.deactivated' END;
  ELSE
    _action := _entity || '.updated';
  END IF;

  PERFORM app.write_audit(_action, _entity, NEW.id::text, _old, _new);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.audit_master_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.audit_master_update() FROM PUBLIC;

CREATE TRIGGER clients_audit_insert AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION app.audit_master_insert('client');
CREATE TRIGGER clients_audit_update AFTER UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION app.audit_master_update('client');
CREATE TRIGGER vendors_audit_insert AFTER INSERT ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION app.audit_master_insert('vendor');
CREATE TRIGGER vendors_audit_update AFTER UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION app.audit_master_update('vendor');
CREATE TRIGGER destinations_audit_insert AFTER INSERT ON public.destinations
  FOR EACH ROW EXECUTE FUNCTION app.audit_master_insert('destination');
CREATE TRIGGER destinations_audit_update AFTER UPDATE ON public.destinations
  FOR EACH ROW EXECUTE FUNCTION app.audit_master_update('destination');

-- ============ PERMISSIONS ============
INSERT INTO public.permissions (key, module, description) VALUES
  ('clients.read', 'clients', 'View client master records'),
  ('clients.manage', 'clients', 'Create, edit, activate and deactivate clients'),
  ('vendors.read', 'vendors', 'View vendor master records'),
  ('vendors.manage', 'vendors', 'Create, edit, activate and deactivate vendors'),
  ('destinations.read', 'destinations', 'View destination master records'),
  ('destinations.manage', 'destinations', 'Create, edit, activate and deactivate destinations')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('admin', 'clients.read'), ('admin', 'clients.manage'),
  ('admin', 'vendors.read'), ('admin', 'vendors.manage'),
  ('admin', 'destinations.read'), ('admin', 'destinations.manage'),
  ('sales', 'clients.read'), ('sales', 'clients.manage'),
  ('sales', 'vendors.read'), ('sales', 'destinations.read'),
  ('operations', 'clients.read'),
  ('operations', 'vendors.read'), ('operations', 'vendors.manage'),
  ('operations', 'destinations.read'), ('operations', 'destinations.manage'),
  ('accounts', 'clients.read'), ('accounts', 'vendors.read'), ('accounts', 'destinations.read'),
  ('viewer', 'clients.read'), ('viewer', 'vendors.read'), ('viewer', 'destinations.read')
ON CONFLICT DO NOTHING;