CREATE TABLE public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  default_markup_percent numeric(7,2) NOT NULL DEFAULT 10 CHECK (default_markup_percent >= 0 AND default_markup_percent <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings_select_signed_in" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_settings_update_admin" ON public.app_settings FOR UPDATE TO authenticated
  USING (app.is_admin(auth.uid())) WITH CHECK (app.is_admin(auth.uid()));
INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
CREATE TRIGGER app_settings_set_updated_at BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER app_settings_audit AFTER UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION app.audit_money_row('app_settings');

ALTER TABLE public.clients ADD COLUMN markup_percent_override numeric(7,2)
  CHECK (markup_percent_override IS NULL OR (markup_percent_override >= 0 AND markup_percent_override <= 1000));