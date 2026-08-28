-- Roles enum
CREATE TYPE public.app_role AS ENUM ('admin', 'sales', 'operations', 'accounts', 'viewer');

-- Shared updated_at trigger fn
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ user_roles ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ security definer helpers ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), FALSE);
$$;

-- ============ permission framework ============
CREATE TABLE public.permissions (
  key TEXT PRIMARY KEY,
  module TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role, permission_key)
);

GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_active_user(_user_id) AND (
    public.is_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = _user_id AND rp.permission_key = _permission_key
    )
  );
$$;

-- Phase 1 baseline permissions only (no financial module permissions yet)
INSERT INTO public.permissions (key, module, description) VALUES
  ('app.access', 'core', 'Sign in and use the application'),
  ('users.read', 'administration', 'View application users'),
  ('users.manage', 'administration', 'Create and edit application users'),
  ('audit.read', 'administration', 'View the audit log'),
  ('settings.manage', 'administration', 'Change application settings');

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('admin', 'app.access'),
  ('admin', 'users.read'),
  ('admin', 'users.manage'),
  ('admin', 'audit.read'),
  ('admin', 'settings.manage'),
  ('sales', 'app.access'),
  ('operations', 'app.access'),
  ('accounts', 'app.access'),
  ('viewer', 'app.access');

-- ============ audit_log ============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX audit_log_entity_idx ON public.audit_log (entity_type, entity_id);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============ RLS policies ============
-- profiles
CREATE POLICY "profiles_select_own" ON public.profiles
FOR SELECT TO authenticated
USING (id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "profiles_insert_self_or_admin" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "profiles_update_own_or_admin" ON public.profiles
FOR UPDATE TO authenticated
USING (id = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "profiles_delete_admin" ON public.profiles
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- prevent non-admins from self-elevating the is_active flag
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    IF NEW.is_active <> OLD.is_active OR NEW.email <> OLD.email THEN
      RAISE EXCEPTION 'Only administrators can change account status or email';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_guard_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- user_roles
CREATE POLICY "user_roles_select_own_or_admin" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "user_roles_insert_admin" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "user_roles_update_admin" ON public.user_roles
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "user_roles_delete_admin" ON public.user_roles
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- permissions / role_permissions (read-only to signed-in users)
CREATE POLICY "permissions_select_authenticated" ON public.permissions
FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "role_permissions_select_authenticated" ON public.role_permissions
FOR SELECT TO authenticated USING (TRUE);

-- audit_log
CREATE POLICY "audit_log_select_admin" ON public.audit_log
FOR SELECT TO authenticated
USING (public.has_permission(auth.uid(), 'audit.read'));

CREATE POLICY "audit_log_insert_self" ON public.audit_log
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());