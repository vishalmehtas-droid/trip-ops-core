-- ============================================================
-- Phase 2B-0A: Leads + Travel Requirements
-- ============================================================

CREATE TYPE public.lead_status AS ENUM ('new','in_progress','quoted','negotiation','won','lost');
CREATE TYPE public.requirement_status AS ENUM ('draft','active','superseded','closed');

CREATE SEQUENCE public.lead_number_seq;
CREATE SEQUENCE public.requirement_number_seq;
REVOKE ALL ON SEQUENCE public.lead_number_seq FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.requirement_number_seq FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- LEADS
-- ------------------------------------------------------------
CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_number text NOT NULL UNIQUE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  enquiry_date date NOT NULL DEFAULT CURRENT_DATE,
  assigned_to uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source text,
  status public.lead_status NOT NULL DEFAULT 'new',
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX leads_client_idx ON public.leads (client_id);
CREATE INDEX leads_assigned_idx ON public.leads (assigned_to);
CREATE INDEX leads_status_idx ON public.leads (status);
CREATE INDEX leads_enquiry_date_idx ON public.leads (enquiry_date DESC);

GRANT SELECT, INSERT, UPDATE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY leads_select_read_permission ON public.leads
  FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.read'));
CREATE POLICY leads_insert_manage ON public.leads
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage') AND created_by = auth.uid());
CREATE POLICY leads_update_manage ON public.leads
  FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'));

CREATE TRIGGER leads_set_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- TRAVEL REQUIREMENTS
-- ------------------------------------------------------------
CREATE TABLE public.travel_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_number text NOT NULL UNIQUE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  travel_start_date date,
  travel_end_date date,
  adults integer NOT NULL DEFAULT 1 CHECK (adults >= 1),
  children integer NOT NULL DEFAULT 0 CHECK (children >= 0),
  rooms integer CHECK (rooms IS NULL OR rooms >= 0),
  trip_type text,
  budget numeric(14,2) CHECK (budget IS NULL OR budget >= 0),
  notes text,
  status public.requirement_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT travel_requirements_dates_ordered
    CHECK (travel_start_date IS NULL OR travel_end_date IS NULL OR travel_end_date >= travel_start_date)
);

CREATE INDEX travel_requirements_lead_idx ON public.travel_requirements (lead_id, created_at);
CREATE INDEX travel_requirements_status_idx ON public.travel_requirements (status);

GRANT SELECT, INSERT, UPDATE ON public.travel_requirements TO authenticated;
GRANT ALL ON public.travel_requirements TO service_role;
ALTER TABLE public.travel_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY travel_requirements_select_read_permission ON public.travel_requirements
  FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.read'));
CREATE POLICY travel_requirements_insert_manage ON public.travel_requirements
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage') AND created_by = auth.uid());
CREATE POLICY travel_requirements_update_manage ON public.travel_requirements
  FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'));

CREATE TRIGGER travel_requirements_set_updated_at
  BEFORE UPDATE ON public.travel_requirements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- REQUIREMENT DESTINATIONS (normalised, ordered, multi-destination)
-- ------------------------------------------------------------
CREATE TABLE public.travel_requirement_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id uuid NOT NULL REFERENCES public.travel_requirements(id) ON DELETE CASCADE,
  destination_id uuid NOT NULL REFERENCES public.destinations(id) ON DELETE RESTRICT,
  sequence_order integer NOT NULL DEFAULT 1 CHECK (sequence_order >= 1),
  nights integer CHECK (nights IS NULL OR nights >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_id, sequence_order)
);

CREATE INDEX trd_requirement_idx ON public.travel_requirement_destinations (requirement_id, sequence_order);
CREATE INDEX trd_destination_idx ON public.travel_requirement_destinations (destination_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.travel_requirement_destinations TO authenticated;
GRANT ALL ON public.travel_requirement_destinations TO service_role;
ALTER TABLE public.travel_requirement_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY trd_select_read_permission ON public.travel_requirement_destinations
  FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.read'));
CREATE POLICY trd_insert_manage ON public.travel_requirement_destinations
  FOR INSERT TO authenticated
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'));
CREATE POLICY trd_update_manage ON public.travel_requirement_destinations
  FOR UPDATE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'))
  WITH CHECK (app.has_permission(auth.uid(), 'leads.manage'));
-- The itinerary legs of a requirement are replaceable working data, so the
-- rows themselves may be removed; the requirement is never hard-deleted.
CREATE POLICY trd_delete_manage ON public.travel_requirement_destinations
  FOR DELETE TO authenticated
  USING (app.has_permission(auth.uid(), 'leads.manage'));

-- ------------------------------------------------------------
-- SYSTEM-GENERATED NUMBERS + INTEGRITY GUARDS
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.guard_lead_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Browser-supplied numbers are always discarded.
  NEW.lead_number := 'LD-' || to_char(nextval('public.lead_number_seq'), 'FM000000');

  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_active) THEN
    RAISE EXCEPTION 'A new lead requires an active client';
  END IF;

  IF NOT app.is_active_user(NEW.assigned_to) THEN
    RAISE EXCEPTION 'The lead must be assigned to an active user';
  END IF;

  IF NEW.status <> 'new' THEN
    RAISE EXCEPTION 'New leads must start with the New status';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.guard_lead_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.lead_number := OLD.lead_number;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_active) THEN
    RAISE EXCEPTION 'The selected client must be active';
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NOT app.is_active_user(NEW.assigned_to) THEN
    RAISE EXCEPTION 'The lead must be assigned to an active user';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'new' AND NEW.status IN ('in_progress','quoted','lost'))
      OR (OLD.status = 'in_progress' AND NEW.status IN ('quoted','negotiation','lost'))
      OR (OLD.status = 'quoted' AND NEW.status IN ('negotiation','won','lost'))
      OR (OLD.status = 'negotiation' AND NEW.status IN ('quoted','won','lost'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status IN ('won','lost') THEN
    RAISE EXCEPTION 'A % lead can no longer be edited', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.lead_is_editable(_lead_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = _lead_id AND status NOT IN ('won','lost')
  );
$$;

CREATE OR REPLACE FUNCTION app.guard_requirement_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.requirement_number := 'RQ-' || to_char(nextval('public.requirement_number_seq'), 'FM000000');

  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = NEW.lead_id) THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  IF NOT app.lead_is_editable(NEW.lead_id) THEN
    RAISE EXCEPTION 'Requirements can only be added while the lead is open';
  END IF;
  IF NEW.status NOT IN ('draft','active') THEN
    RAISE EXCEPTION 'New requirements must start as Draft or Active';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.guard_requirement_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.requirement_number := OLD.requirement_number;
  NEW.lead_id := OLD.lead_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('active','closed'))
      OR (OLD.status = 'active' AND NEW.status IN ('superseded','closed'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status IN ('superseded','closed') THEN
    RAISE EXCEPTION 'A % requirement can no longer be edited', OLD.status;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app.guard_requirement_destination()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _req public.travel_requirements;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO _req FROM public.travel_requirements WHERE id = OLD.requirement_id;
    IF _req.id IS NOT NULL AND _req.status IN ('superseded','closed') THEN
      RAISE EXCEPTION 'A % requirement can no longer be edited', _req.status;
    END IF;
    RETURN OLD;
  END IF;

  SELECT * INTO _req FROM public.travel_requirements WHERE id = NEW.requirement_id;
  IF _req.id IS NULL THEN
    RAISE EXCEPTION 'Requirement not found';
  END IF;
  IF _req.status IN ('superseded','closed') THEN
    RAISE EXCEPTION 'A % requirement can no longer be edited', _req.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = NEW.destination_id AND d.is_active) THEN
    RAISE EXCEPTION 'The selected destination does not exist or is inactive';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.guard_lead_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.guard_lead_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.guard_requirement_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.guard_requirement_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.guard_requirement_destination() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.lead_is_editable(uuid) FROM PUBLIC;

CREATE TRIGGER leads_guard_insert BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION app.guard_lead_insert();
CREATE TRIGGER leads_guard_update BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION app.guard_lead_update();
CREATE TRIGGER travel_requirements_guard_insert BEFORE INSERT ON public.travel_requirements
  FOR EACH ROW EXECUTE FUNCTION app.guard_requirement_insert();
CREATE TRIGGER travel_requirements_guard_update BEFORE UPDATE ON public.travel_requirements
  FOR EACH ROW EXECUTE FUNCTION app.guard_requirement_update();
CREATE TRIGGER trd_guard BEFORE INSERT OR UPDATE OR DELETE ON public.travel_requirement_destinations
  FOR EACH ROW EXECUTE FUNCTION app.guard_requirement_destination();

-- ------------------------------------------------------------
-- TRUSTED AUDIT TRAIL
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.audit_lead_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM app.write_audit('lead.created', 'lead', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at');
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.audit_lead_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit('lead.status_changed', 'lead', NEW.id::text,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    _old := _old - 'status';
    _new := _new - 'status';
  END IF;

  IF _new <> '{}'::jsonb THEN
    PERFORM app.write_audit('lead.updated', 'lead', NEW.id::text, _old, _new);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.audit_requirement_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM app.write_audit('requirement.created', 'travel_requirement', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at');
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.audit_requirement_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit('requirement.status_changed', 'travel_requirement', NEW.id::text,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    _old := _old - 'status';
    _new := _new - 'status';
  END IF;

  IF _new <> '{}'::jsonb THEN
    PERFORM app.write_audit('requirement.updated', 'travel_requirement', NEW.id::text, _old, _new);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION app.audit_lead_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.audit_lead_update() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.audit_requirement_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.audit_requirement_update() FROM PUBLIC;

CREATE TRIGGER leads_audit_insert AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION app.audit_lead_insert();
CREATE TRIGGER leads_audit_update AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION app.audit_lead_update();
CREATE TRIGGER travel_requirements_audit_insert AFTER INSERT ON public.travel_requirements
  FOR EACH ROW EXECUTE FUNCTION app.audit_requirement_insert();
CREATE TRIGGER travel_requirements_audit_update AFTER UPDATE ON public.travel_requirements
  FOR EACH ROW EXECUTE FUNCTION app.audit_requirement_update();

-- ------------------------------------------------------------
-- PERMISSIONS
-- ------------------------------------------------------------
INSERT INTO public.permissions (key, module, description) VALUES
  ('leads.read', 'leads', 'View leads and travel requirements'),
  ('leads.manage', 'leads', 'Create and modify leads and travel requirements')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('admin', 'leads.read'),
  ('admin', 'leads.manage'),
  ('sales', 'leads.read'),
  ('sales', 'leads.manage'),
  ('operations', 'leads.read'),
  ('accounts', 'leads.read'),
  ('viewer', 'leads.read')
ON CONFLICT DO NOTHING;