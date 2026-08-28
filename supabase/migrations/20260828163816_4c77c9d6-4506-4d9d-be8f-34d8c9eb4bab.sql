DROP VIEW public.user_directory;

CREATE VIEW public.user_directory
WITH (security_invoker = true) AS
SELECT p.id, p.name
FROM public.profiles p;

GRANT SELECT ON public.user_directory TO authenticated;

-- Active colleagues may resolve names of other application users.
CREATE POLICY profiles_select_directory ON public.profiles
  FOR SELECT TO authenticated
  USING (app.is_active_user(auth.uid()));