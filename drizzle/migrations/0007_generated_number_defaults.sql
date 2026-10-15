-- Placeholders only; BEFORE INSERT triggers always overwrite these values.
ALTER TABLE public.sales ALTER COLUMN booking_number SET DEFAULT '';
ALTER TABLE public.purchases ALTER COLUMN purchase_number SET DEFAULT '';
ALTER TABLE public.purchases ALTER COLUMN created_by SET DEFAULT auth.uid();