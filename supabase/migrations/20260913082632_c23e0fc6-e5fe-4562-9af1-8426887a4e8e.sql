CREATE OR REPLACE FUNCTION app.guard_sale_pricing_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _status public.sale_status;
BEGIN
  SELECT status INTO _status FROM public.sales WHERE id = NEW.sale_id;
  IF _status IS NULL THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  IF _status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'Pricing can only be changed while the booking is pending or confirmed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app.guard_sale_pricing_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sale_pricing_guard_update ON public.sale_pricing;
CREATE TRIGGER sale_pricing_guard_update
BEFORE UPDATE ON public.sale_pricing
FOR EACH ROW EXECUTE FUNCTION app.guard_sale_pricing_update();