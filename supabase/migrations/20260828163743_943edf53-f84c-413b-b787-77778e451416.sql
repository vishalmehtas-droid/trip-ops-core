CREATE VIEW public.user_directory
WITH (security_invoker = false) AS
SELECT p.id, p.name
FROM public.profiles p
WHERE app.is_active_user(auth.uid());

GRANT SELECT ON public.user_directory TO authenticated;