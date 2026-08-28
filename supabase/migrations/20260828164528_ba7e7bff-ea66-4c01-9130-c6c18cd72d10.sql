REVOKE DELETE, TRUNCATE ON public.clients FROM authenticated, anon;
REVOKE DELETE, TRUNCATE ON public.vendors FROM authenticated, anon;
REVOKE DELETE, TRUNCATE ON public.destinations FROM authenticated, anon;