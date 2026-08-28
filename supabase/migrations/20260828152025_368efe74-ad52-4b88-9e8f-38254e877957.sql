-- =========================================================
-- 1. ACTIVE-STATUS AWARE AUTHORIZATION HELPERS
-- =========================================================
CREATE OR REPLACE FUNCTION app.is_active_user(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), FALSE);
$$;

CREATE OR REPLACE FUNCTION app.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT app.is_active_user(_user_id)
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION app.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT app.is_active_user(_user_id)
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- =========================================================
-- 2. TRUSTED AUDIT WRITER (private, never a public RPC)
-- =========================================================
CREATE OR REPLACE FUNCTION app.write_audit(
  _action text,
  _entity_type text,
  _entity_id text,
  _old jsonb,
  _new jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, _old, _new);
END;
$$;

REVOKE ALL ON FUNCTION app.write_audit(text, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.write_audit(text, text, text, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION app.write_audit(text, text, text, jsonb, jsonb) FROM authenticated;

-- Audit log is append-only and system-written only.
DROP POLICY IF EXISTS audit_log_insert_self ON public.audit_log;
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM anon;

-- =========================================================
-- 3. AUDIT TRIGGERS FOR PHASE 1 ADMIN ACTIONS
-- =========================================================
CREATE OR REPLACE FUNCTION app.audit_profile_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM app.write_audit(
    'profile.created', 'profile', NEW.id::text, NULL,
    jsonb_build_object('name', NEW.name, 'email', NEW.email, 'is_active', NEW.is_active)
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.audit_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _action text := 'profile.updated';
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    _old := _old || jsonb_build_object('name', OLD.name);
    _new := _new || jsonb_build_object('name', NEW.name);
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    _old := _old || jsonb_build_object('email', OLD.email);
    _new := _new || jsonb_build_object('email', NEW.email);
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    _old := _old || jsonb_build_object('is_active', OLD.is_active);
    _new := _new || jsonb_build_object('is_active', NEW.is_active);
    _action := CASE WHEN NEW.is_active THEN 'user.activated' ELSE 'user.deactivated' END;
  END IF;

  IF _new = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  PERFORM app.write_audit(_action, 'profile', NEW.id::text, _old, _new);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.audit_role_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM app.write_audit(
    'role.assigned', 'user_role', NEW.user_id::text, NULL,
    jsonb_build_object('role', NEW.role)
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION app.audit_role_removed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM app.write_audit(
    'role.removed', 'user_role', OLD.user_id::text,
    jsonb_build_object('role', OLD.role), NULL
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS profiles_audit_insert ON public.profiles;
CREATE TRIGGER profiles_audit_insert AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION app.audit_profile_insert();

DROP TRIGGER IF EXISTS profiles_audit_update ON public.profiles;
CREATE TRIGGER profiles_audit_update AFTER UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION app.audit_profile_update();

DROP TRIGGER IF EXISTS user_roles_audit_insert ON public.user_roles;
CREATE TRIGGER user_roles_audit_insert AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION app.audit_role_assigned();

DROP TRIGGER IF EXISTS user_roles_audit_delete ON public.user_roles;
CREATE TRIGGER user_roles_audit_delete AFTER DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION app.audit_role_removed();

-- =========================================================
-- 4. LAST-ACTIVE-ADMIN PROTECTION + PROFILE INTEGRITY GUARDS
-- =========================================================
CREATE OR REPLACE FUNCTION app.other_active_admin_exists(_excluded_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'admin'::public.app_role
      AND ur.user_id <> _excluded_user_id
      AND p.is_active
  );
$$;

CREATE OR REPLACE FUNCTION app.guard_role_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF OLD.role = 'admin'::public.app_role
     AND NOT app.other_active_admin_exists(OLD.user_id) THEN
    RAISE EXCEPTION 'At least one active administrator must remain';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_guard_delete ON public.user_roles;
CREATE TRIGGER user_roles_guard_delete BEFORE DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION app.guard_role_delete();

CREATE OR REPLACE FUNCTION app.guard_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Profile identity cannot be changed';
  END IF;

  -- The profile email mirrors the authentication identity and is read-only here.
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Profile email is read-only and derived from the authenticated account';
  END IF;

  IF NOT app.is_admin(auth.uid()) AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Only administrators can change account status';
  END IF;

  IF OLD.is_active AND NOT NEW.is_active
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = OLD.id AND role = 'admin'::public.app_role
     )
     AND NOT app.other_active_admin_exists(OLD.id) THEN
    RAISE EXCEPTION 'At least one active administrator must remain';
  END IF;

  RETURN NEW;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_key
  ON public.profiles (lower(email));

-- =========================================================
-- 5. TRUSTED PROFILE PROVISIONING (identity derived from the JWT)
-- =========================================================
CREATE OR REPLACE FUNCTION public.ensure_own_profile()
RETURNS public.profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid();
  _claims jsonb := COALESCE(auth.jwt(), '{}'::jsonb);
  _email text;
  _name text;
  _row public.profiles;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO _row FROM public.profiles WHERE id = _uid;
  IF FOUND THEN
    RETURN _row;
  END IF;

  _email := COALESCE(_claims->>'email', '');
  _name := COALESCE(
    NULLIF(_claims->'user_metadata'->>'name', ''),
    NULLIF(split_part(_email, '@', 1), ''),
    ''
  );

  INSERT INTO public.profiles (id, email, name)
  VALUES (_uid, _email, _name)
  ON CONFLICT (id) DO NOTHING;

  SELECT * INTO _row FROM public.profiles WHERE id = _uid;
  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_own_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_own_profile() FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_own_profile() TO authenticated;

-- Clients may no longer insert arbitrary profile rows.
DROP POLICY IF EXISTS profiles_insert_self_or_admin ON public.profiles;
CREATE POLICY profiles_insert_admin ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (app.is_admin(auth.uid()));

-- Deactivated users cannot mutate their own profile.
DROP POLICY IF EXISTS profiles_update_own_or_admin ON public.profiles;
CREATE POLICY profiles_update_own_or_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING ((id = auth.uid() AND app.is_active_user(auth.uid())) OR app.is_admin(auth.uid()))
  WITH CHECK ((id = auth.uid() AND app.is_active_user(auth.uid())) OR app.is_admin(auth.uid()));

-- =========================================================
-- 6. TIGHTEN REFERENCE TABLE READS TO ACTIVE USERS
-- =========================================================
DROP POLICY IF EXISTS permissions_select_authenticated ON public.permissions;
CREATE POLICY permissions_select_active ON public.permissions
  FOR SELECT TO authenticated
  USING (app.is_active_user(auth.uid()));

DROP POLICY IF EXISTS role_permissions_select_authenticated ON public.role_permissions;
CREATE POLICY role_permissions_select_active ON public.role_permissions
  FOR SELECT TO authenticated
  USING (app.is_active_user(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.permissions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.role_permissions FROM authenticated;
REVOKE ALL ON public.permissions FROM anon;
REVOKE ALL ON public.role_permissions FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.user_roles FROM anon;
REVOKE ALL ON public.audit_log FROM anon;

-- Deactivated users must not read their own role rows for privilege decisions.
DROP POLICY IF EXISTS user_roles_select_own_or_admin ON public.user_roles;
CREATE POLICY user_roles_select_own_or_admin ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid() AND app.is_active_user(auth.uid()))
    OR app.is_admin(auth.uid())
  );

-- =========================================================
-- 7. CLEAN UP UNUSED PERMISSION
-- =========================================================
DELETE FROM public.role_permissions WHERE permission_key = 'app.access';
DELETE FROM public.permissions WHERE key = 'app.access';