CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION app.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION app.is_active_user(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), FALSE);
$$;

CREATE OR REPLACE FUNCTION app.has_permission(_user_id UUID, _permission_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app.is_active_user(_user_id) AND (
    app.is_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = _user_id AND rp.permission_key = _permission_key
    )
  );
$$;

CREATE OR REPLACE FUNCTION app.guard_profile_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app.is_admin(auth.uid()) THEN
    IF NEW.is_active <> OLD.is_active OR NEW.email <> OLD.email THEN
      RAISE EXCEPTION 'Only administrators can change account status or email';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.has_role(UUID, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.is_active_user(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.has_permission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.is_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.is_active_user(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.has_permission(UUID, TEXT) TO authenticated, service_role;

-- Repoint policies + trigger to the private helpers
DROP TRIGGER IF EXISTS profiles_guard_update ON public.profiles;
CREATE TRIGGER profiles_guard_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION app.guard_profile_update();

DROP POLICY "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT TO authenticated USING (id = auth.uid() OR app.is_admin(auth.uid()));

DROP POLICY "profiles_insert_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_insert_self_or_admin" ON public.profiles
FOR INSERT TO authenticated WITH CHECK (id = auth.uid() OR app.is_admin(auth.uid()));

DROP POLICY "profiles_update_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_own_or_admin" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid() OR app.is_admin(auth.uid()))
WITH CHECK (id = auth.uid() OR app.is_admin(auth.uid()));

DROP POLICY "profiles_delete_admin" ON public.profiles;
CREATE POLICY "profiles_delete_admin" ON public.profiles
FOR DELETE TO authenticated USING (app.is_admin(auth.uid()));

DROP POLICY "user_roles_select_own_or_admin" ON public.user_roles;
CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid() OR app.is_admin(auth.uid()));

DROP POLICY "user_roles_insert_admin" ON public.user_roles;
CREATE POLICY "user_roles_insert_admin" ON public.user_roles
FOR INSERT TO authenticated WITH CHECK (app.is_admin(auth.uid()));

DROP POLICY "user_roles_update_admin" ON public.user_roles;
CREATE POLICY "user_roles_update_admin" ON public.user_roles
FOR UPDATE TO authenticated USING (app.is_admin(auth.uid())) WITH CHECK (app.is_admin(auth.uid()));

DROP POLICY "user_roles_delete_admin" ON public.user_roles;
CREATE POLICY "user_roles_delete_admin" ON public.user_roles
FOR DELETE TO authenticated USING (app.is_admin(auth.uid()));

DROP POLICY "audit_log_select_admin" ON public.audit_log;
CREATE POLICY "audit_log_select_admin" ON public.audit_log
FOR SELECT TO authenticated USING (app.has_permission(auth.uid(), 'audit.read'));

-- Remove the publicly exposed duplicates
DROP FUNCTION IF EXISTS public.has_permission(UUID, TEXT);
DROP FUNCTION IF EXISTS public.is_active_user(UUID);
DROP FUNCTION IF EXISTS public.is_admin(UUID);
DROP FUNCTION IF EXISTS public.has_role(UUID, public.app_role);
DROP FUNCTION IF EXISTS public.guard_profile_update();