DROP TRIGGER IF EXISTS vendors_guard_vendor_type ON public.vendors;
DROP FUNCTION IF EXISTS app.guard_vendor_vendor_type() CASCADE;
ALTER TABLE public.vendors DROP COLUMN IF EXISTS vendor_type_id;
DROP TABLE IF EXISTS public.vendor_types CASCADE;