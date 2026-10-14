ALTER TABLE public.sales ADD COLUMN customer_quote_id uuid REFERENCES public.customer_quotes(id) ON DELETE RESTRICT UNIQUE;
ALTER TABLE public.sales ADD COLUMN quote_itinerary jsonb;
COMMENT ON COLUMN public.sales.quote_itinerary IS 'Ordered itinerary snapshot from the converted quote requirement; existing destination_id remains the first stop.';

CREATE OR REPLACE FUNCTION app.guard_sale_quote_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.customer_quote_id IS DISTINCT FROM OLD.customer_quote_id OR NEW.quote_itinerary IS DISTINCT FROM OLD.quote_itinerary THEN
      RAISE EXCEPTION 'Booking quote link and itinerary snapshot are immutable';
    END IF;
  ELSIF NEW.customer_quote_id IS NOT NULL OR NEW.quote_itinerary IS NOT NULL THEN
    IF COALESCE(current_setting('app.cq_conversion', true), '') <> NEW.customer_quote_id::text
       OR NEW.customer_quote_id IS NULL THEN
      RAISE EXCEPTION 'Quote links can only be created by accepted quote conversion';
    END IF;
    IF NOT app.has_permission(auth.uid(), 'leads.manage') OR NOT app.has_permission(auth.uid(), 'sales.manage')
       OR NOT EXISTS (SELECT 1 FROM public.customer_quotes WHERE id = NEW.customer_quote_id AND status = 'accepted' AND client_id = NEW.client_id) THEN
      RAISE EXCEPTION 'Not allowed to link this quote';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app.guard_sale_quote_link() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sales_guard_quote_link BEFORE INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION app.guard_sale_quote_link();

CREATE OR REPLACE FUNCTION public.convert_customer_quote_to_booking(_quote_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _q public.customer_quotes; _req public.travel_requirements; _lead public.leads;
  _p public.customer_quote_pricing; _bp public.sale_pricing;
  _sale uuid; _destination uuid; _itinerary jsonb; _line record;
  _previous_flag text := COALESCE(current_setting('app.cq_conversion', true), '');
BEGIN
  IF auth.uid() IS NULL OR NOT app.is_active_user(auth.uid())
     OR NOT app.has_permission(auth.uid(), 'leads.manage') OR NOT app.has_permission(auth.uid(), 'sales.manage')
     OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','sales')) THEN
    RAISE EXCEPTION 'Forbidden: active Admin or Sales access is required';
  END IF;
  SELECT * INTO _q FROM public.customer_quotes WHERE id = _quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer quote not found'; END IF;
  IF _q.status <> 'accepted' THEN RAISE EXCEPTION 'Only an Accepted customer quote can be converted'; END IF;
  SELECT id INTO _sale FROM public.sales WHERE customer_quote_id = _q.id;
  IF FOUND THEN RETURN _sale; END IF;
  SELECT * INTO _req FROM public.travel_requirements WHERE id = _q.requirement_id FOR UPDATE;
  IF NOT FOUND OR _req.lead_id <> _q.lead_id THEN RAISE EXCEPTION 'Travel requirement not found for this quote'; END IF;
  SELECT * INTO _lead FROM public.leads WHERE id = _q.lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF _lead.status = 'lost' THEN RAISE EXCEPTION 'A Lost lead cannot be converted into a booking'; END IF;
  IF _lead.client_id <> _q.client_id THEN RAISE EXCEPTION 'The lead client no longer matches this quote'; END IF;
  IF _req.travel_start_date IS NOT NULL AND _req.travel_start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Travel date cannot be before the booking date';
  END IF;
  SELECT * INTO _p FROM public.customer_quote_pricing WHERE customer_quote_id = _q.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer quote pricing is missing'; END IF;
  PERFORM 1 FROM public.travel_requirement_destinations WHERE requirement_id = _req.id FOR SHARE;
  IF EXISTS (SELECT 1 FROM public.travel_requirement_destinations leg JOIN public.destinations d ON d.id = leg.destination_id
             WHERE leg.requirement_id = _req.id AND NOT d.is_active) THEN
    RAISE EXCEPTION 'A new booking requires active destinations';
  END IF;
  SELECT leg.destination_id INTO _destination FROM public.travel_requirement_destinations leg
    WHERE leg.requirement_id = _req.id ORDER BY leg.sequence_order, leg.id LIMIT 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('destination_id', leg.destination_id, 'name', d.name,
      'sequence_order', leg.sequence_order, 'nights', leg.nights) ORDER BY leg.sequence_order, leg.id), '[]'::jsonb)
    INTO _itinerary FROM public.travel_requirement_destinations leg JOIN public.destinations d ON d.id = leg.destination_id
    WHERE leg.requirement_id = _req.id;
  PERFORM set_config('app.cq_conversion', _q.id::text, true);
  INSERT INTO public.sales (client_id, destination_id, travel_date, notes, billing_type, customer_quote_id, quote_itinerary)
    VALUES (_q.client_id, _destination, _req.travel_start_date, _q.notes, _p.billing_type, _q.id, _itinerary)
    RETURNING id INTO _sale;
  FOR _line IN
    SELECT l.*, sq.vendor_id FROM public.customer_quote_lines l
      LEFT JOIN public.supplier_quote_lines sl ON sl.id = l.source_supplier_quote_line_id
      LEFT JOIN public.supplier_quotes sq ON sq.id = sl.supplier_quote_id
      WHERE l.customer_quote_id = _q.id ORDER BY l.sort_order, l.id
  LOOP
    INSERT INTO public.sales_items (sale_id, item_type, description, vendor_id, quantity, sort_order)
      VALUES (_sale, _line.purchase_type, _line.description, _line.vendor_id, _line.quantity, _line.sort_order);
    -- Snapshot is the whole line INR cost. Quantity 1 avoids loss from dividing/rounding unit costs.
    INSERT INTO public.sale_costs (sale_id, vendor_id, cost_type, description, quantity, unit_cost, currency_code, exchange_rate, sort_order)
      VALUES (_sale, _line.vendor_id, _line.purchase_type::text::public.sale_cost_type, _line.description,
              1, _line.expected_cost_inr, 'INR', 1, _line.sort_order);
  END LOOP;
  UPDATE public.sale_pricing SET markup_type = _p.markup_type, markup_value = _p.markup_value,
    discount_amount = _p.discount_amount, tcs_applicable = _p.tcs_applicable, tcs_rate = _p.tcs_rate
    WHERE sale_id = _sale RETURNING * INTO _bp;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking pricing is missing'; END IF;
  -- Existing triggers call app.calc_pricing. Reject the entire transaction if any copied amount differs.
  IF ROW(_bp.expected_cost, _bp.markup_amount, _bp.service_charge_amount, _bp.selling_value, _bp.gst_rate,
         _bp.gst_amount, _bp.tcs_rate, _bp.tcs_amount, _bp.customer_payable, _bp.expected_gross_profit)
     IS DISTINCT FROM ROW(_p.expected_cost, _p.markup_amount, _p.service_charge_amount, _p.selling_value, _p.gst_rate,
         _p.gst_amount, _p.tcs_rate, _p.tcs_amount, _p.customer_payable, _p.expected_gross_profit) THEN
    RAISE EXCEPTION 'Booking pricing does not match the Accepted quote; conversion was rolled back';
  END IF;
  -- Preserve the existing forward-only lead transitions instead of bypassing their guard.
  IF _lead.status IN ('new','in_progress') THEN
    UPDATE public.leads SET status = 'quoted' WHERE id = _lead.id;
  END IF;
  IF _lead.status <> 'won' THEN UPDATE public.leads SET status = 'won' WHERE id = _lead.id; END IF;
  PERFORM app.write_audit('customer_quote.converted', 'customer_quote', _q.id::text, NULL,
    jsonb_build_object('sale_id', _sale, 'quote_number', _q.quote_number));
  PERFORM app.write_audit('sale.from_customer_quote', 'sale', _sale::text, NULL,
    jsonb_build_object('customer_quote_id', _q.id, 'requirement_id', _req.id, 'itinerary', _itinerary));
  PERFORM set_config('app.cq_conversion', _previous_flag, true);
  RETURN _sale;
END;
$$;
REVOKE ALL ON FUNCTION public.convert_customer_quote_to_booking(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_customer_quote_to_booking(uuid) TO authenticated;
