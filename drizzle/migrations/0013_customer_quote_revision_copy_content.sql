CREATE OR REPLACE FUNCTION public.create_customer_quote_revision(_quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _old public.customer_quotes; _p public.customer_quote_pricing; _new uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT app.has_permission(auth.uid(), 'leads.manage') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Forbidden: this account is deactivated';
  END IF;
  SELECT * INTO _old FROM public.customer_quotes WHERE id = _quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Customer quote not found'; END IF;
  IF _old.status NOT IN ('sent','rejected','expired') THEN
    RAISE EXCEPTION 'Only a sent, rejected or expired quote can be revised';
  END IF;
  PERFORM set_config('app.cq_revision', 'on', true);
  INSERT INTO public.customer_quotes
    (quote_number, lead_id, requirement_id, client_id, valid_until, notes, created_by,
     revision_no, previous_quote_id,
     public_title, summary, itinerary, inclusions, exclusions, terms)
  VALUES ('pending', _old.lead_id, _old.requirement_id, _old.client_id, _old.valid_until,
     _old.notes, auth.uid(), _old.revision_no + 1, _old.id,
     _old.public_title, _old.summary, _old.itinerary, _old.inclusions, _old.exclusions, _old.terms)
  RETURNING id INTO _new;
  INSERT INTO public.customer_quote_lines
    (customer_quote_id, source_supplier_quote_line_id, purchase_type, description, quantity,
     currency, expected_cost_inr, sort_order)
  SELECT _new, source_supplier_quote_line_id, purchase_type, description, quantity,
     currency, expected_cost_inr, sort_order
  FROM public.customer_quote_lines WHERE customer_quote_id = _old.id;
  SELECT * INTO _p FROM public.customer_quote_pricing WHERE customer_quote_id = _old.id;
  UPDATE public.customer_quote_pricing SET
    billing_type = _p.billing_type, markup_type = _p.markup_type, markup_value = _p.markup_value,
    discount_amount = _p.discount_amount, tcs_applicable = _p.tcs_applicable, tcs_rate = _p.tcs_rate
   WHERE customer_quote_id = _new;
  UPDATE public.customer_quotes SET status = 'superseded' WHERE id = _old.id;
  PERFORM set_config('app.cq_revision', 'off', true);
  RETURN _new;
END;
$function$;