CREATE SCHEMA IF NOT EXISTS app;

CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE SEQUENCE IF NOT EXISTS drizzle.__drizzle_migrations_id_seq START 1 INCREMENT 1; -- last_value: unused

CREATE TABLE drizzle.__drizzle_migrations (
  id integer DEFAULT nextval('drizzle.__drizzle_migrations_id_seq'::regclass) NOT NULL,
  hash text NOT NULL,
  created_at bigint
);

CREATE OR REPLACE FUNCTION app.assign_booking_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.booking_number := 'BK-' || lpad(nextval('public.booking_number_seq')::text, 6, '0');
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.audit_customer_quote()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _old jsonb; _new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app.write_audit('customer_quote.created', 'customer_quote', NEW.id::text, NULL,
      to_jsonb(NEW) - 'created_at' - 'updated_at' - 'share_token');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit('customer_quote.status_changed', 'customer_quote', NEW.id::text,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
  ELSE
    _old := to_jsonb(OLD) - 'created_at' - 'updated_at' - 'share_token' - 'view_count' - 'last_viewed_at';
    _new := to_jsonb(NEW) - 'created_at' - 'updated_at' - 'share_token' - 'view_count' - 'last_viewed_at';
    IF _old IS DISTINCT FROM _new THEN
      PERFORM app.write_audit('customer_quote.updated', 'customer_quote', NEW.id::text, _old, _new);
    END IF;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_customer_quote_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app.write_audit('customer_quote.line_added', 'customer_quote', NEW.customer_quote_id::text,
      NULL, to_jsonb(NEW) - 'created_at' - 'updated_at');
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM app.write_audit('customer_quote.line_updated', 'customer_quote', NEW.customer_quote_id::text,
      to_jsonb(OLD) - 'created_at' - 'updated_at', to_jsonb(NEW) - 'created_at' - 'updated_at');
  ELSE
    PERFORM app.write_audit('customer_quote.line_removed', 'customer_quote', OLD.customer_quote_id::text,
      to_jsonb(OLD) - 'created_at' - 'updated_at', NULL);
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_customer_quote_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _o jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _n jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb; _new jsonb := '{}'::jsonb; _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_n) LOOP
    IF _n->_key IS DISTINCT FROM _o->_key THEN
      _old := _old || jsonb_build_object(_key, _o->_key);
      _new := _new || jsonb_build_object(_key, _n->_key);
    END IF;
  END LOOP;
  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;
  PERFORM app.write_audit('customer_quote_pricing.updated', 'customer_quote',
    NEW.customer_quote_id::text, _old, _new);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_lead_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit('lead.created', 'lead', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at');
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_lead_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;

  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit('lead.status_changed', 'lead', NEW.id::text,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    _old := _old - 'status';
    _new := _new - 'status';
  END IF;

  IF _new <> '{}'::jsonb THEN
    PERFORM app.write_audit('lead.updated', 'lead', NEW.id::text, _old, _new);
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_master_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _entity text := TG_ARGV[0];
  _row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _src text := NULLIF(current_setting('app.import_source', true), '');
BEGIN
  IF _src IS NOT NULL THEN _row := _row || jsonb_build_object('import_source', _src); END IF;
  PERFORM app.write_audit(_entity || '.created', _entity, (_row->>'id'), NULL, _row);
  RETURN NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION app.audit_master_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _entity text := TG_ARGV[0];
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
  _action text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;

  IF _new = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    _action := _entity || CASE WHEN NEW.is_active THEN '.activated' ELSE '.deactivated' END;
  ELSE
    _action := _entity || '.updated';
  END IF;

  PERFORM app.write_audit(_action, _entity, NEW.id::text, _old, _new);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_money_row()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _entity text := TG_ARGV[0];
  _old_row jsonb; _new_row jsonb;
  _old jsonb := '{}'::jsonb; _new jsonb := '{}'::jsonb; _key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app.write_audit(_entity || '.created', _entity, NEW.id::text, NULL,
      to_jsonb(NEW) - 'created_at' - 'updated_at');
    RETURN NULL;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM app.write_audit(_entity || '.removed', _entity, OLD.id::text,
      to_jsonb(OLD) - 'created_at' - 'updated_at', NULL);
    RETURN NULL;
  END IF;
  _old_row := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row := to_jsonb(NEW) - 'created_at' - 'updated_at';
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;
  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;
  PERFORM app.write_audit(
    CASE WHEN _new_row->>'status' = 'cancelled' AND _old_row->>'status' IS DISTINCT FROM 'cancelled'
      THEN _entity || '.cancelled' ELSE _entity || '.updated' END,
    _entity, NEW.id::text, _old, _new);
  RETURN NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION app.audit_profile_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit(
    'profile.created', 'profile', NEW.id::text, NULL,
    jsonb_build_object('name', NEW.name, 'email', NEW.email, 'is_active', NEW.is_active)
  );
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _action text := 'profile.updated';
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    _old := _old || jsonb_build_object('name', OLD.name);
    _new := _new || jsonb_build_object('name', NEW.name);
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    _old := _old || jsonb_build_object('email', OLD.email);
    _new := _new || jsonb_build_object('email', NEW.email);
  END IF;
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    _old := _old || jsonb_build_object('is_active', OLD.is_active);
    _new := _new || jsonb_build_object('is_active', NEW.is_active);
    _action := CASE WHEN NEW.is_active THEN 'user.activated' ELSE 'user.deactivated' END;
  END IF;

  IF _new = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  PERFORM app.write_audit(_action, 'profile', NEW.id::text, _old, _new);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_purchase_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit('purchase.created', 'purchase', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at');
  RETURN NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION app.audit_purchase_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb; _new jsonb := '{}'::jsonb; _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;
  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;
  PERFORM app.write_audit(
    CASE WHEN NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN 'purchase.cancelled' ELSE 'purchase.updated' END,
    'purchase', NEW.id::text, _old, _new);
  RETURN NULL;
END; $function$
;

CREATE OR REPLACE FUNCTION app.audit_requirement_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit('requirement.created', 'travel_requirement', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at');
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_requirement_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;

  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit('requirement.status_changed', 'travel_requirement', NEW.id::text,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
    _old := _old - 'status';
    _new := _new - 'status';
  END IF;

  IF _new <> '{}'::jsonb THEN
    PERFORM app.write_audit('requirement.updated', 'travel_requirement', NEW.id::text, _old, _new);
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_role_assigned()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit(
    'role.assigned', 'user_role', NEW.user_id::text, NULL,
    jsonb_build_object('role', NEW.role)
  );
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_role_removed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit(
    'role.removed', 'user_role', OLD.user_id::text,
    jsonb_build_object('role', OLD.role), NULL
  );
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_cost_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit('sale_cost.deleted', 'sale_cost', OLD.id::text,
    to_jsonb(OLD) - 'created_at' - 'updated_at', NULL);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_cost_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit('sale_cost.created', 'sale_cost', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at');
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_cost_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;
  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;
  PERFORM app.write_audit('sale_cost.updated', 'sale_cost', NEW.id::text, _old, _new);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit(
    'sale.created', 'sale', NEW.id::text, NULL,
    to_jsonb(NEW) - 'created_at' - 'updated_at'
  );
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_item_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit(
    'sale_item.deleted', 'sale_item', OLD.id::text,
    jsonb_build_object(
      'sale_id', OLD.sale_id,
      'item_type', OLD.item_type,
      'description', OLD.description,
      'vendor_id', OLD.vendor_id,
      'quantity', OLD.quantity,
      'sort_order', OLD.sort_order
    ),
    NULL
  );
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_item_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit(
    'sale_item.created', 'sale_item', NEW.id::text, NULL,
    jsonb_build_object(
      'sale_id', NEW.sale_id,
      'item_type', NEW.item_type,
      'description', NEW.description,
      'vendor_id', NEW.vendor_id,
      'quantity', NEW.quantity,
      'sort_order', NEW.sort_order
    )
  );
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_item_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
BEGIN
  IF NEW.item_type IS DISTINCT FROM OLD.item_type THEN
    _old := _old || jsonb_build_object('item_type', OLD.item_type);
    _new := _new || jsonb_build_object('item_type', NEW.item_type);
  END IF;
  IF NEW.description IS DISTINCT FROM OLD.description THEN
    _old := _old || jsonb_build_object('description', OLD.description);
    _new := _new || jsonb_build_object('description', NEW.description);
  END IF;
  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    _old := _old || jsonb_build_object('vendor_id', OLD.vendor_id);
    _new := _new || jsonb_build_object('vendor_id', NEW.vendor_id);
  END IF;
  IF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    _old := _old || jsonb_build_object('quantity', OLD.quantity);
    _new := _new || jsonb_build_object('quantity', NEW.quantity);
  END IF;
  IF NEW.sort_order IS DISTINCT FROM OLD.sort_order THEN
    _old := _old || jsonb_build_object('sort_order', OLD.sort_order);
    _new := _new || jsonb_build_object('sort_order', NEW.sort_order);
  END IF;

  IF _new = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  PERFORM app.write_audit('sale_item.updated', 'sale_item', NEW.id::text, _old, _new);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_pricing_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;
  IF _new = '{}'::jsonb THEN RETURN NULL; END IF;
  PERFORM app.write_audit('sale_pricing.updated', 'sale_pricing', NEW.sale_id::text, _old, _new);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_sale_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_row jsonb := to_jsonb(OLD) - 'created_at' - 'updated_at';
  _new_row jsonb := to_jsonb(NEW) - 'created_at' - 'updated_at';
  _old jsonb := '{}'::jsonb;
  _new jsonb := '{}'::jsonb;
  _key text;
BEGIN
  FOR _key IN SELECT jsonb_object_keys(_new_row) LOOP
    IF _new_row->_key IS DISTINCT FROM _old_row->_key THEN
      _old := _old || jsonb_build_object(_key, _old_row->_key);
      _new := _new || jsonb_build_object(_key, _new_row->_key);
    END IF;
  END LOOP;

  IF _new = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit(
      'sale.status_changed', 'sale', NEW.id::text,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
    _old := _old - 'status';
    _new := _new - 'status';
  END IF;

  IF _new <> '{}'::jsonb THEN
    PERFORM app.write_audit('sale.updated', 'sale', NEW.id::text, _old, _new);
  END IF;

  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_supplier_quote()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _old jsonb; _new jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app.write_audit('supplier_quote.created', 'supplier_quote', NEW.id::text, NULL,
      to_jsonb(NEW) - 'created_at' - 'updated_at');
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM app.write_audit('supplier_quote.status_changed', 'supplier_quote', NEW.id::text,
      jsonb_build_object('status', OLD.status), jsonb_build_object('status', NEW.status));
  ELSE
    _old := to_jsonb(OLD) - 'created_at' - 'updated_at';
    _new := to_jsonb(NEW) - 'created_at' - 'updated_at';
    IF _old IS DISTINCT FROM _new THEN
      PERFORM app.write_audit('supplier_quote.updated', 'supplier_quote', NEW.id::text, _old, _new);
    END IF;
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_supplier_quote_file()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.write_audit('supplier_quote.file_uploaded', 'supplier_quote',
    NEW.supplier_quote_id::text, NULL, to_jsonb(NEW) - 'created_at');
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.audit_supplier_quote_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM app.write_audit('supplier_quote.line_added', 'supplier_quote', NEW.supplier_quote_id::text,
      NULL, to_jsonb(NEW) - 'created_at' - 'updated_at');
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM app.write_audit('supplier_quote.line_updated', 'supplier_quote', NEW.supplier_quote_id::text,
      to_jsonb(OLD) - 'created_at' - 'updated_at', to_jsonb(NEW) - 'created_at' - 'updated_at');
  ELSE
    PERFORM app.write_audit('supplier_quote.line_removed', 'supplier_quote', OLD.supplier_quote_id::text,
      to_jsonb(OLD) - 'created_at' - 'updated_at', NULL);
  END IF;
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.block_invoice_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN RAISE EXCEPTION 'Invoices cannot be deleted'; END; $function$
;

CREATE OR REPLACE FUNCTION app.calc_pricing(_billing billing_type, _cost numeric, _markup_type markup_type, _markup_value numeric, _discount numeric, _tcs_applicable boolean, _tcs_rate numeric, OUT charge numeric, OUT selling numeric, OUT gst_rate numeric, OUT gst numeric, OUT tcs_rate numeric, OUT tcs numeric, OUT payable numeric, OUT profit numeric)
 RETURNS record
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  _cost := round(_cost, 2);
  charge := CASE _markup_type
    WHEN 'percentage' THEN round(_cost * _markup_value / 100, 2)
    WHEN 'lumpsum' THEN round(_markup_value, 2)
    ELSE 0 END;
  selling := round(_cost + charge - _discount, 2);
  IF selling < 0 THEN RAISE EXCEPTION 'The discount cannot exceed the selling value'; END IF;
  IF _billing = 'tour_package' THEN
    gst_rate := 5; gst := round(selling * 5 / 100, 2);
  ELSE
    -- Standalone services are taxed on the service charge only.
    gst_rate := 18; gst := round(charge * 18 / 100, 2);
  END IF;
  IF _tcs_applicable THEN
    tcs_rate := COALESCE(_tcs_rate, 2.00);
    tcs := round((selling + gst) * tcs_rate / 100, 2);
  ELSE
    tcs_rate := NULL; tcs := 0;
  END IF;
  payable := round(selling + gst + tcs, 2);
  -- TCS is never part of profit.
  profit := round(selling - _cost, 2);
END;
$function$
;

CREATE OR REPLACE FUNCTION app.can_read_invoices(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT app.has_role(_uid, 'admin') OR app.has_role(_uid, 'accounts') OR app.has_role(_uid, 'sales');
$function$
;

CREATE OR REPLACE FUNCTION app.check_receipt_total(_sale_id uuid, _exclude uuid, _amount numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _payable numeric; _received numeric; _linked numeric;
BEGIN
  PERFORM 1 FROM public.sales WHERE id = _sale_id FOR UPDATE;
  SELECT customer_payable INTO _payable FROM public.sale_pricing WHERE sale_id = _sale_id;
  SELECT COALESCE(sum(amount_inr), 0) INTO _received FROM public.customer_receipts
    WHERE sale_id = _sale_id AND status = 'recorded' AND (_exclude IS NULL OR id <> _exclude);
  SELECT COALESCE(sum(a.amount_inr), 0) INTO _linked FROM public.customer_receipt_allocations a
    JOIN public.customer_receipts r ON r.id = a.receipt_id AND r.status = 'recorded'
    WHERE a.sale_id = _sale_id;
  _received := _received + _linked;
  IF _received + _amount > COALESCE(_payable, 0) THEN
    RAISE EXCEPTION 'Receipts would exceed the booking''s customer payable (outstanding %)',
      to_char(GREATEST(COALESCE(_payable,0) - _received, 0), 'FM999999999990.00');
  END IF;
END; $function$
;

CREATE OR REPLACE FUNCTION app.compute_customer_quote_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _cost numeric(14,2); r record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id; NEW.customer_quote_id := OLD.customer_quote_id; NEW.created_at := OLD.created_at;
    IF COALESCE(current_setting('app.cq_recalc', true), '') <> 'on'
       AND NOT app.customer_quote_is_draft(NEW.customer_quote_id) THEN
      RAISE EXCEPTION 'Pricing can only be changed while the quote is a draft';
    END IF;
  END IF;
  SELECT COALESCE(round(SUM(expected_cost_inr), 2), 0) INTO _cost
    FROM public.customer_quote_lines WHERE customer_quote_id = NEW.customer_quote_id;
  r := app.calc_pricing(NEW.billing_type, _cost, NEW.markup_type, NEW.markup_value,
         NEW.discount_amount, NEW.tcs_applicable, NEW.tcs_rate);
  NEW.gst_rate := r.gst_rate;
  NEW.tcs_rate := r.tcs_rate;
  NEW.markup_amount := r.charge;
  NEW.service_charge_amount := r.charge;
  NEW.selling_value := r.selling;
  NEW.gst_amount := r.gst;
  NEW.tcs_amount := r.tcs;
  NEW.customer_payable := r.payable;
  NEW.expected_cost := _cost;
  NEW.expected_gross_profit := r.profit;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.compute_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.currency_code := upper(btrim(NEW.currency_code));
  IF NEW.currency_code = 'INR' THEN NEW.exchange_rate := 1; END IF;
  NEW.amount_inr := round(NEW.amount * NEW.exchange_rate, 2);
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.compute_sale_cost()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.currency_code := upper(btrim(NEW.currency_code));
  IF NEW.currency_code = 'INR' THEN
    NEW.exchange_rate := 1;
  END IF;
  -- Client-supplied totals are always discarded and recomputed here.
  NEW.total_cost := round(NEW.quantity::numeric * NEW.unit_cost, 2);
  NEW.base_currency_cost := round(NEW.total_cost * NEW.exchange_rate, 2);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.compute_sale_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _billing public.billing_type; _cost numeric(14,2); r record;
BEGIN
  SELECT billing_type INTO _billing FROM public.sales WHERE id = NEW.sale_id;
  IF _billing IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  SELECT COALESCE(round(SUM(base_currency_cost), 2), 0) INTO _cost
    FROM public.sale_costs WHERE sale_id = NEW.sale_id;
  r := app.calc_pricing(_billing, _cost, NEW.markup_type, NEW.markup_value,
         NEW.discount_amount, NEW.tcs_applicable, NEW.tcs_rate);
  NEW.gst_rate := r.gst_rate;
  NEW.tcs_rate := r.tcs_rate;
  NEW.markup_amount := r.charge;
  NEW.service_charge_amount := r.charge;
  NEW.selling_value := r.selling;
  NEW.gst_amount := r.gst;
  NEW.tcs_amount := r.tcs;
  NEW.customer_payable := r.payable;
  NEW.expected_cost := _cost;
  NEW.expected_gross_profit := r.profit;
  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id; NEW.sale_id := OLD.sale_id; NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.create_customer_quote_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.customer_quote_pricing (customer_quote_id) VALUES (NEW.id);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.customer_quote_is_draft(_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.customer_quotes WHERE id = _id AND status = 'draft');
$function$
;

CREATE OR REPLACE FUNCTION app.customer_receipt_is_recorded(_receipt_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.customer_receipts WHERE id = _receipt_id AND status = 'recorded');
$function$
;

CREATE OR REPLACE FUNCTION app.guard_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.id = '00000000-0000-0000-0000-000000000001'::uuid THEN
      RAISE EXCEPTION 'The Unassigned account can''t be changed';
    END IF;
    NEW.id := OLD.id; NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at;
  ELSE
    NEW.created_by := auth.uid(); NEW.created_at := now(); NEW.updated_at := now();
  END IF;
  NEW.name := btrim(NEW.name);
  NEW.last4 := NULLIF(btrim(NEW.last4), '');
  -- Credit cards: the amount owed is entered positive and stored as a negative balance.
  IF NEW.account_type = 'credit_card' THEN NEW.opening_balance := -abs(NEW.opening_balance); END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_quote_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.quote_number := 'CQ-' || to_char(nextval('public.customer_quote_number_seq'), 'FM000000');
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status := 'draft';
  SELECT client_id INTO NEW.client_id FROM public.leads WHERE id = NEW.lead_id;
  IF NEW.client_id IS NULL THEN RAISE EXCEPTION 'Lead not found'; END IF;
  IF COALESCE(current_setting('app.cq_revision', true), '') <> 'on' THEN
    NEW.revision_no := 1;
    NEW.previous_quote_id := NULL;
    IF EXISTS (SELECT 1 FROM public.travel_requirements
               WHERE id = NEW.requirement_id AND status IN ('superseded','closed')) THEN
      RAISE EXCEPTION 'Customer quotes can only be added to draft or active requirements';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.travel_requirements
                 WHERE id = NEW.requirement_id AND lead_id = NEW.lead_id) THEN
    RAISE EXCEPTION 'Requirement does not belong to this lead';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_quote_insert_share()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.share_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  NEW.share_enabled := false;
  NEW.view_count := 0;
  NEW.last_viewed_at := NULL;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_quote_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _quote uuid; _src record; _req uuid;
BEGIN
  _quote := CASE WHEN TG_OP = 'DELETE' THEN OLD.customer_quote_id ELSE NEW.customer_quote_id END;
  IF TG_OP = 'UPDATE' AND NEW.customer_quote_id IS DISTINCT FROM OLD.customer_quote_id THEN
    RAISE EXCEPTION 'Lines cannot be moved between quotes';
  END IF;
  IF NOT app.customer_quote_is_draft(_quote) THEN
    RAISE EXCEPTION 'Lines can only be changed while the quote is a draft';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  NEW.currency := upper(btrim(NEW.currency));
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
    NEW.source_supplier_quote_line_id := OLD.source_supplier_quote_line_id;
    -- The cost snapshot of a supplier-sourced line never changes.
    IF OLD.source_supplier_quote_line_id IS NOT NULL THEN
      NEW.expected_cost_inr := OLD.expected_cost_inr;
    END IF;
  ELSE
    NEW.created_at := now();
    IF NEW.source_supplier_quote_line_id IS NOT NULL
       AND COALESCE(current_setting('app.cq_revision', true), '') <> 'on' THEN
      SELECT l.amount_inr, q.requirement_id INTO _src
        FROM public.supplier_quote_lines l
        JOIN public.supplier_quotes q ON q.id = l.supplier_quote_id
       WHERE l.id = NEW.source_supplier_quote_line_id;
      SELECT requirement_id INTO _req FROM public.customer_quotes WHERE id = _quote;
      IF _src IS NULL OR _src.requirement_id <> _req THEN
        RAISE EXCEPTION 'Supplier quote line does not belong to this requirement';
      END IF;
      NEW.expected_cost_inr := _src.amount_inr;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_quote_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _rev boolean := COALESCE(current_setting('app.cq_revision', true), '') = 'on';
  _view boolean := COALESCE(current_setting('app.cq_view', true), '') = 'on';
BEGIN
  NEW.id := OLD.id;
  NEW.quote_number := OLD.quote_number;
  NEW.lead_id := OLD.lead_id;
  NEW.requirement_id := OLD.requirement_id;
  NEW.client_id := OLD.client_id;
  NEW.revision_no := OLD.revision_no;
  NEW.previous_quote_id := OLD.previous_quote_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.share_token := OLD.share_token;
  IF NOT _view THEN
    NEW.view_count := OLD.view_count;
    NEW.last_viewed_at := OLD.last_viewed_at;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'superseded' THEN
      IF NOT _rev THEN RAISE EXCEPTION 'Quotes are superseded only by creating a revision'; END IF;
    ELSIF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('sent','accepted'))
      OR (OLD.status = 'sent' AND NEW.status IN ('accepted','rejected','expired'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status <> 'draft' THEN
    -- Only sharing state and view tracking may change after a quote leaves Draft.
    IF (to_jsonb(NEW) - 'share_enabled' - 'view_count' - 'last_viewed_at' - 'updated_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'share_enabled' - 'view_count' - 'last_viewed_at' - 'updated_at') THEN
      RAISE EXCEPTION 'A % customer quote can no longer be edited', OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_receipt_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _rec public.customer_receipts; _sale public.sales;
BEGIN
  NEW.id := gen_random_uuid(); NEW.created_at := now(); NEW.updated_at := now();
  SELECT * INTO _rec FROM public.customer_receipts WHERE id = NEW.receipt_id FOR UPDATE;
  SELECT * INTO _sale FROM public.sales WHERE id = NEW.sale_id;
  IF _rec.id IS NULL OR _rec.status <> 'recorded' THEN RAISE EXCEPTION 'Receipt not found or cancelled'; END IF;
  IF _rec.sale_id IS NOT NULL THEN RAISE EXCEPTION 'This receipt is already recorded against a booking'; END IF;
  IF _sale.id IS NULL OR _sale.status = 'cancelled' THEN RAISE EXCEPTION 'Advances can only be linked to bookings that are not cancelled'; END IF;
  IF _sale.client_id <> _rec.client_id THEN RAISE EXCEPTION 'Advances can only be linked to the same client''s bookings'; END IF;
  IF app.receipt_allocated(_rec.id) + NEW.amount_inr > _rec.amount_inr THEN
    RAISE EXCEPTION 'Links exceed the unallocated amount of %', _rec.receipt_number;
  END IF;
  PERFORM app.check_receipt_total(NEW.sale_id, NULL, NEW.amount_inr);
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_receipt_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := gen_random_uuid();
  NEW.receipt_number := 'RC-' || lpad(nextval('public.customer_receipt_number_seq')::text, 6, '0');
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status := 'recorded';
  NEW.cancel_reason := NULL;
  NEW.reference := NULLIF(btrim(NEW.reference), '');
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  IF NEW.created_by IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NEW.sale_id IS NOT NULL THEN
    SELECT client_id INTO NEW.client_id FROM public.sales WHERE id = NEW.sale_id;
    IF NOT app.sale_accepts_purchases(NEW.sale_id) THEN
      RAISE EXCEPTION 'Receipts can''t be recorded on a cancelled booking';
    END IF;
    PERFORM app.check_receipt_total(NEW.sale_id, NULL, NEW.amount_inr);
  ELSIF NEW.client_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clients WHERE id = NEW.client_id) THEN
    RAISE EXCEPTION 'Select a client or a booking';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_customer_receipt_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := OLD.id;
  NEW.receipt_number := OLD.receipt_number;
  NEW.sale_id := OLD.sale_id;
  NEW.client_id := OLD.client_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled receipt can no longer be changed';
  END IF;
  IF NEW.status = 'cancelled' THEN
    NEW.payment_type := OLD.payment_type; NEW.receipt_date := OLD.receipt_date;
    NEW.amount_inr := OLD.amount_inr; NEW.method := OLD.method;
    NEW.reference := OLD.reference; NEW.notes := OLD.notes;
    NEW.cancel_reason := NULLIF(btrim(NEW.cancel_reason), '');
    IF NEW.cancel_reason IS NULL THEN RAISE EXCEPTION 'A reason is required to cancel a receipt'; END IF;
    RETURN NEW;
  END IF;
  NEW.status := 'recorded';
  NEW.cancel_reason := NULL;
  NEW.reference := NULLIF(btrim(NEW.reference), '');
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  IF OLD.sale_id IS NOT NULL THEN
    IF NOT app.sale_accepts_purchases(OLD.sale_id) THEN
      RAISE EXCEPTION 'Receipts on a cancelled booking can only be cancelled';
    END IF;
    PERFORM app.check_receipt_total(OLD.sale_id, OLD.id, NEW.amount_inr);
  ELSIF NEW.amount_inr < app.receipt_allocated(OLD.id) THEN
    RAISE EXCEPTION 'The amount can''t be less than what is already linked to bookings';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_invoice_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = 'cancelled' THEN RAISE EXCEPTION 'A cancelled invoice can no longer be changed'; END IF;
  IF NEW.status <> 'cancelled' THEN RAISE EXCEPTION 'An issued invoice cannot be edited'; END IF;
  IF (to_jsonb(NEW) - 'status' - 'cancel_reason' - 'cancelled_at' - 'cancelled_by' - 'updated_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'cancel_reason' - 'cancelled_at' - 'cancelled_by' - 'updated_at') THEN
    RAISE EXCEPTION 'An issued invoice cannot be edited';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_lead_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Browser-supplied numbers are always discarded.
  NEW.lead_number := 'LD-' || to_char(nextval('public.lead_number_seq'), 'FM000000');

  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_active) THEN
    RAISE EXCEPTION 'A new lead requires an active client';
  END IF;

  IF NOT app.is_active_user(NEW.assigned_to) THEN
    RAISE EXCEPTION 'The lead must be assigned to an active user';
  END IF;

  IF NEW.status <> 'new' THEN
    RAISE EXCEPTION 'New leads must start with the New status';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_lead_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := OLD.id;
  NEW.lead_number := OLD.lead_number;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_active) THEN
    RAISE EXCEPTION 'The selected client must be active';
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NOT app.is_active_user(NEW.assigned_to) THEN
    RAISE EXCEPTION 'The lead must be assigned to an active user';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'new' AND NEW.status IN ('in_progress','quoted','lost'))
      OR (OLD.status = 'in_progress' AND NEW.status IN ('quoted','negotiation','lost'))
      OR (OLD.status = 'quoted' AND NEW.status IN ('negotiation','won','lost'))
      OR (OLD.status = 'negotiation' AND NEW.status IN ('quoted','won','lost'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status IN ('won','lost') THEN
    RAISE EXCEPTION 'A % lead can no longer be edited', OLD.status;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_money_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' THEN
    NEW.account_id := OLD.account_id; NEW.cleared := OLD.cleared; NEW.cleared_on := OLD.cleared_on;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.account_id AND is_active) THEN
      RAISE EXCEPTION 'Select an active account';
    END IF;
  END IF;
  IF NEW.cleared THEN NEW.cleared_on := COALESCE(NEW.cleared_on, current_date);
  ELSE NEW.cleared_on := NULL; END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_other_transaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.id := gen_random_uuid();
    NEW.entry_number := 'OT-' || lpad(nextval('public.other_transaction_number_seq')::text, 6, '0');
    NEW.created_by := auth.uid(); NEW.created_at := now(); NEW.updated_at := now();
    NEW.status := 'recorded'; NEW.cancel_reason := NULL;
    IF NEW.created_by IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  ELSE
    NEW.id := OLD.id; NEW.entry_number := OLD.entry_number;
    NEW.created_by := OLD.created_by; NEW.created_at := OLD.created_at;
    IF OLD.status = 'cancelled' THEN RAISE EXCEPTION 'A cancelled entry can no longer be changed'; END IF;
    IF NEW.status = 'cancelled' THEN
      NEW.txn_type := OLD.txn_type; NEW.txn_date := OLD.txn_date; NEW.amount_inr := OLD.amount_inr;
      NEW.account_id := OLD.account_id; NEW.to_account_id := OLD.to_account_id;
      NEW.category := OLD.category; NEW.party := OLD.party; NEW.notes := OLD.notes;
      NEW.reference := OLD.reference; NEW.cleared := OLD.cleared; NEW.cleared_on := OLD.cleared_on;
      NEW.cancel_reason := NULLIF(btrim(NEW.cancel_reason), '');
      IF NEW.cancel_reason IS NULL THEN RAISE EXCEPTION 'A reason is required to cancel an entry'; END IF;
      RETURN NEW;
    END IF;
    NEW.status := 'recorded'; NEW.cancel_reason := NULL;
  END IF;
  NEW.category := NULLIF(btrim(NEW.category), '');
  NEW.party := NULLIF(btrim(NEW.party), '');
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  NEW.reference := NULLIF(btrim(NEW.reference), '');
  IF TG_OP = 'INSERT' OR NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.account_id AND is_active) THEN
      RAISE EXCEPTION 'Select an active account';
    END IF;
  END IF;
  IF NEW.to_account_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.to_account_id IS DISTINCT FROM OLD.to_account_id) THEN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = NEW.to_account_id AND is_active) THEN
      RAISE EXCEPTION 'Select an active "to" account';
    END IF;
  END IF;
  IF NEW.cleared THEN NEW.cleared_on := COALESCE(NEW.cleared_on, current_date);
  ELSE NEW.cleared_on := NULL; END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Profile identity cannot be changed';
  END IF;

  -- The profile email mirrors the authentication identity and is read-only here.
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Profile email is read-only and derived from the authenticated account';
  END IF;

  IF NOT app.is_admin(auth.uid()) AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Only administrators can change account status';
  END IF;

  IF OLD.is_active AND NOT NEW.is_active
     AND EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = OLD.id AND role = 'admin'::public.app_role
     )
     AND NOT app.other_active_admin_exists(OLD.id) THEN
    RAISE EXCEPTION 'At least one active administrator must remain';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_purchase_allocations()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'recorded' THEN
    IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id AND app.purchase_allocated(OLD.id) > 0 THEN
      RAISE EXCEPTION 'This purchase has vendor payments allocated; the vendor can''t be changed';
    END IF;
    IF NEW.amount_inr < app.purchase_allocated(OLD.id) THEN
      RAISE EXCEPTION 'The INR amount can''t be less than the payments already allocated';
    END IF;
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_purchase_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := gen_random_uuid();
  NEW.purchase_number := 'PU-' || lpad(nextval('public.purchase_number_seq')::text, 6, '0');
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status := 'recorded';
  NEW.cancel_reason := NULL;
  IF NEW.created_by IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT app.sale_accepts_purchases(NEW.sale_id) THEN
    RAISE EXCEPTION 'Purchases can''t be added to a cancelled booking';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_purchase_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := OLD.id;
  NEW.purchase_number := OLD.purchase_number;
  NEW.sale_id := OLD.sale_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF NOT app.sale_accepts_purchases(OLD.sale_id) THEN
    RAISE EXCEPTION 'Purchases on a cancelled booking can no longer be changed';
  END IF;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled purchase can no longer be changed';
  END IF;
  IF NEW.status = 'cancelled' THEN
    NEW.vendor_id := OLD.vendor_id;
    NEW.vendor_invoice_number := OLD.vendor_invoice_number;
    NEW.invoice_date := OLD.invoice_date;
    NEW.currency_code := OLD.currency_code;
    NEW.exchange_rate := OLD.exchange_rate;
    NEW.amount := OLD.amount;
    NEW.notes := OLD.notes;
    NEW.cancel_reason := NULLIF(btrim(NEW.cancel_reason), '');
    IF NEW.cancel_reason IS NULL THEN RAISE EXCEPTION 'A reason is required to cancel a purchase'; END IF;
  ELSE
    NEW.status := 'recorded';
    NEW.cancel_reason := NULL;
    IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
      RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
    END IF;
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_requirement_destination()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _req public.travel_requirements;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO _req FROM public.travel_requirements WHERE id = OLD.requirement_id;
    IF _req.id IS NOT NULL AND _req.status IN ('superseded','closed') THEN
      RAISE EXCEPTION 'A % requirement can no longer be edited', _req.status;
    END IF;
    RETURN OLD;
  END IF;

  SELECT * INTO _req FROM public.travel_requirements WHERE id = NEW.requirement_id;
  IF _req.id IS NULL THEN
    RAISE EXCEPTION 'Requirement not found';
  END IF;
  IF _req.status IN ('superseded','closed') THEN
    RAISE EXCEPTION 'A % requirement can no longer be edited', _req.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = NEW.destination_id AND d.is_active) THEN
    RAISE EXCEPTION 'The selected destination does not exist or is inactive';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_requirement_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.requirement_number := 'RQ-' || to_char(nextval('public.requirement_number_seq'), 'FM000000');

  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = NEW.lead_id) THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;
  IF NOT app.lead_is_editable(NEW.lead_id) THEN
    RAISE EXCEPTION 'Requirements can only be added while the lead is open';
  END IF;
  IF NEW.status NOT IN ('draft','active') THEN
    RAISE EXCEPTION 'New requirements must start as Draft or Active';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_requirement_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := OLD.id;
  NEW.requirement_number := OLD.requirement_number;
  NEW.lead_id := OLD.lead_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('active','closed'))
      OR (OLD.status = 'active' AND NEW.status IN ('superseded','closed'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status IN ('superseded','closed') THEN
    RAISE EXCEPTION 'A % requirement can no longer be edited', OLD.status;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_role_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.role = 'admin'::public.app_role
     AND NOT app.other_active_admin_exists(OLD.user_id) THEN
    RAISE EXCEPTION 'At least one active administrator must remain';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_booking_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.booking_number := OLD.booking_number;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_cost_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT app.sale_is_editable(OLD.sale_id) THEN
    RAISE EXCEPTION 'Costs can only be removed while the booking is pending or confirmed';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_cost_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT app.sale_is_editable(NEW.sale_id) THEN
    RAISE EXCEPTION 'Costs can only be added while the booking is pending or confirmed';
  END IF;
  IF NEW.vendor_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_cost_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := OLD.id;
  NEW.sale_id := OLD.sale_id;
  NEW.created_at := OLD.created_at;

  IF NOT app.sale_is_editable(OLD.sale_id) THEN
    RAISE EXCEPTION 'Costs can only be edited while the booking is pending or confirmed';
  END IF;

  IF NEW.vendor_id IS NOT NULL
     AND NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_active) THEN
    RAISE EXCEPTION 'A new booking requires an active client';
  END IF;

  IF NEW.destination_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = NEW.destination_id AND d.is_active) THEN
    RAISE EXCEPTION 'A new booking requires an active destination';
  END IF;

  IF NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'New bookings must start as Pending';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_item_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT app.sale_is_editable(OLD.sale_id) THEN
    RAISE EXCEPTION 'Components can only be removed while the booking is pending or confirmed';
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_item_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT app.sale_is_editable(NEW.sale_id) THEN
    RAISE EXCEPTION 'Components can only be added while the booking is pending or confirmed';
  END IF;

  IF NEW.vendor_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_item_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Component identity cannot be changed';
  END IF;
  IF NEW.sale_id <> OLD.sale_id THEN
    RAISE EXCEPTION 'A component cannot be moved to another booking';
  END IF;
  IF NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Component creation time cannot be changed';
  END IF;

  IF NOT app.sale_is_editable(OLD.sale_id) THEN
    RAISE EXCEPTION 'Components can only be edited while the booking is pending or confirmed';
  END IF;

  -- A newly associated vendor must be active; an unchanged historical vendor stays.
  IF NEW.vendor_id IS NOT NULL
     AND NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_pricing_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_quote_link()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION app.guard_sale_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Historical integrity
  NEW.id := OLD.id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  NEW.booking_date := OLD.booking_date;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.is_active) THEN
    RAISE EXCEPTION 'The selected client must be active';
  END IF;

  IF NEW.destination_id IS DISTINCT FROM OLD.destination_id
     AND NEW.destination_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.destinations d WHERE d.id = NEW.destination_id AND d.is_active) THEN
    RAISE EXCEPTION 'The selected destination must be active';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
      OR (OLD.status = 'confirmed' AND NEW.status IN ('completed', 'cancelled'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'A % booking can no longer be edited', OLD.status;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_file()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'Supplier quote files cannot be changed or deleted'; END IF;
  NEW.uploaded_by := auth.uid();
  NEW.created_at := now();
  IF NEW.uploaded_by IS NULL OR NOT app.is_active_user(NEW.uploaded_by) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF split_part(NEW.storage_path, '/', 1) <> NEW.supplier_quote_id::text THEN
    RAISE EXCEPTION 'File path does not belong to this quote';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects
                 WHERE bucket_id = 'supplier-quote-files' AND name = NEW.storage_path) THEN
    RAISE EXCEPTION 'Uploaded file not found';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.quote_number := 'SQ-' || to_char(nextval('public.supplier_quote_number_seq'), 'FM000000');
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status := 'requested';
  NEW.is_superseded := false;
  IF COALESCE(current_setting('app.sq_revision', true), '') <> 'on' THEN
    NEW.revision_number := 1;
    NEW.previous_quote_id := NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.travel_requirements
                 WHERE id = NEW.requirement_id AND lead_id = NEW.lead_id) THEN
    RAISE EXCEPTION 'Requirement does not belong to this lead';
  END IF;
  IF EXISTS (SELECT 1 FROM public.travel_requirements
             WHERE id = NEW.requirement_id AND status IN ('superseded','closed')) THEN
    RAISE EXCEPTION 'Supplier quotes can only be added to draft or active requirements';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'Vendor is inactive or does not exist';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _quote uuid;
BEGIN
  _quote := CASE WHEN TG_OP = 'DELETE' THEN OLD.supplier_quote_id ELSE NEW.supplier_quote_id END;
  IF TG_OP = 'UPDATE' AND NEW.supplier_quote_id IS DISTINCT FROM OLD.supplier_quote_id THEN
    RAISE EXCEPTION 'Lines cannot be moved between quotes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supplier_quotes
                 WHERE id = _quote AND status IN ('requested','received') AND NOT is_superseded) THEN
    RAISE EXCEPTION 'Lines cannot be changed once the quote is selected, rejected or superseded';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' THEN NEW.created_at := OLD.created_at; ELSE NEW.created_at := now(); END IF;
  NEW.currency := upper(btrim(NEW.currency));
  IF NEW.currency = 'INR' THEN NEW.exchange_rate := 1; END IF;
  NEW.amount_inr := round(NEW.quantity::numeric * NEW.unit_amount * NEW.exchange_rate, 2);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_supplier_quote_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _rev boolean := COALESCE(current_setting('app.sq_revision', true), '') = 'on';
BEGIN
  NEW.id := OLD.id;
  NEW.quote_number := OLD.quote_number;
  NEW.lead_id := OLD.lead_id;
  NEW.requirement_id := OLD.requirement_id;
  NEW.vendor_id := OLD.vendor_id;
  NEW.revision_number := OLD.revision_number;
  NEW.previous_quote_id := OLD.previous_quote_id;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF OLD.is_superseded THEN
    RAISE EXCEPTION 'A superseded supplier quote can no longer be edited';
  END IF;
  IF NEW.is_superseded THEN
    IF NOT _rev THEN RAISE EXCEPTION 'Quotes are superseded only by creating a revision'; END IF;
    NEW.status := OLD.status;
    NEW.valid_until := OLD.valid_until;
    NEW.notes := OLD.notes;
    NEW.adults := OLD.adults;
    NEW.children := OLD.children;
    NEW.child_ages := OLD.child_ages;
    NEW.inclusions := OLD.inclusions;
    NEW.exclusions := OLD.exclusions;
    NEW.itinerary_notes := OLD.itinerary_notes;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'requested' AND NEW.status IN ('received','rejected'))
      OR (OLD.status = 'received' AND NEW.status IN ('selected','rejected'))
    ) THEN
      RAISE EXCEPTION 'Status change from % to % is not allowed', OLD.status, NEW.status;
    END IF;
  ELSIF OLD.status IN ('selected','rejected') THEN
    RAISE EXCEPTION 'A % supplier quote can no longer be edited', OLD.status;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.guard_vendor_payment_allocation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _pay public.vendor_payments; _pur public.purchases;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id; NEW.payment_id := OLD.payment_id; NEW.purchase_id := OLD.purchase_id;
    NEW.created_at := OLD.created_at;
  ELSE
    NEW.id := gen_random_uuid(); NEW.created_at := now(); NEW.updated_at := now();
  END IF;
  SELECT * INTO _pay FROM public.vendor_payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT * INTO _pur FROM public.purchases WHERE id = NEW.purchase_id FOR UPDATE;
  IF _pay.id IS NULL OR _pay.status <> 'recorded' THEN RAISE EXCEPTION 'Payment not found or cancelled'; END IF;
  IF _pur.id IS NULL OR _pur.status <> 'recorded' THEN RAISE EXCEPTION 'Allocations can only go to recorded purchases'; END IF;
  IF _pur.vendor_id <> _pay.vendor_id THEN RAISE EXCEPTION 'Allocations must go to purchases of the same vendor'; END IF;
  IF _pay.sale_id IS NOT NULL AND _pur.sale_id <> _pay.sale_id THEN
    RAISE EXCEPTION 'This payment is linked to a booking; allocate only to that booking''s purchases';
  END IF;
  IF app.payment_allocated(_pay.id, NEW.id) + NEW.amount_inr > _pay.amount_inr THEN
    RAISE EXCEPTION 'Allocations exceed the payment amount (%)', _pay.payment_number;
  END IF;
  IF app.purchase_allocated(_pur.id, NEW.id) + NEW.amount_inr > _pur.amount_inr THEN
    RAISE EXCEPTION 'Allocation exceeds the outstanding amount of %', _pur.purchase_number;
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_vendor_payment_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := gen_random_uuid();
  NEW.payment_number := 'PY-' || lpad(nextval('public.vendor_payment_number_seq')::text, 6, '0');
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  NEW.updated_at := now();
  NEW.status := 'recorded';
  NEW.cancel_reason := NULL;
  NEW.reference := NULLIF(btrim(NEW.reference), '');
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  IF NEW.created_by IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
    RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
  END IF;
  IF NEW.sale_id IS NOT NULL AND NOT app.sale_accepts_purchases(NEW.sale_id) THEN
    RAISE EXCEPTION 'Payments can''t be linked to a cancelled booking';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_vendor_payment_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.id := OLD.id;
  NEW.payment_number := OLD.payment_number;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'A cancelled payment can no longer be changed';
  END IF;
  IF NEW.status = 'cancelled' THEN
    NEW.vendor_id := OLD.vendor_id; NEW.sale_id := OLD.sale_id;
    NEW.payment_type := OLD.payment_type; NEW.payment_date := OLD.payment_date;
    NEW.amount_inr := OLD.amount_inr; NEW.method := OLD.method;
    NEW.reference := OLD.reference; NEW.notes := OLD.notes;
    NEW.cancel_reason := NULLIF(btrim(NEW.cancel_reason), '');
    IF NEW.cancel_reason IS NULL THEN RAISE EXCEPTION 'A reason is required to cancel a payment'; END IF;
    RETURN NEW;
  END IF;
  NEW.status := 'recorded';
  NEW.cancel_reason := NULL;
  NEW.reference := NULLIF(btrim(NEW.reference), '');
  NEW.notes := NULLIF(btrim(NEW.notes), '');
  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = NEW.vendor_id AND is_active) THEN
      RAISE EXCEPTION 'The selected vendor does not exist or is inactive';
    END IF;
    IF EXISTS (SELECT 1 FROM public.vendor_payment_allocations WHERE payment_id = OLD.id) THEN
      RAISE EXCEPTION 'Remove the allocations before changing the vendor';
    END IF;
  END IF;
  IF NEW.sale_id IS DISTINCT FROM OLD.sale_id THEN
    IF NEW.sale_id IS NOT NULL AND NOT app.sale_accepts_purchases(NEW.sale_id) THEN
      RAISE EXCEPTION 'Payments can''t be linked to a cancelled booking';
    END IF;
    IF NEW.sale_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.vendor_payment_allocations a JOIN public.purchases p ON p.id = a.purchase_id
      WHERE a.payment_id = OLD.id AND p.sale_id <> NEW.sale_id) THEN
      RAISE EXCEPTION 'Allocations must belong to the linked booking';
    END IF;
  END IF;
  IF NEW.amount_inr < app.payment_allocated(OLD.id) THEN
    RAISE EXCEPTION 'The amount can''t be less than what is already allocated';
  END IF;
  RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION app.guard_vendor_type_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.vendor_type_id IS DISTINCT FROM OLD.vendor_type_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vendor_types
      WHERE id = NEW.vendor_type_id AND is_active
    ) THEN
      RAISE EXCEPTION 'The selected vendor type is not active';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.has_permission(_user_id uuid, _permission_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT app.is_active_user(_user_id) AND (
    app.is_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.role_permissions rp ON rp.role = ur.role
      WHERE ur.user_id = _user_id AND rp.permission_key = _permission_key
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION app.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT app.is_active_user(_user_id)
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$function$
;

CREATE OR REPLACE FUNCTION app.is_active_user(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), FALSE);
$function$
;

CREATE OR REPLACE FUNCTION app.is_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT app.is_active_user(_user_id)
     AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::public.app_role);
$function$
;

CREATE OR REPLACE FUNCTION app.lead_is_editable(_lead_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = _lead_id AND status NOT IN ('won','lost')
  );
$function$
;

CREATE OR REPLACE FUNCTION app.normalize_vendor_type()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.name := btrim(NEW.name);
  IF NEW.name = '' THEN
    RAISE EXCEPTION 'Vendor type name is required';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.other_active_admin_exists(_excluded_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'admin'::public.app_role
      AND ur.user_id <> _excluded_user_id
      AND p.is_active
  );
$function$
;

CREATE OR REPLACE FUNCTION app.payment_allocated(_payment_id uuid, _exclude uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(sum(a.amount_inr), 0) FROM public.vendor_payment_allocations a
  JOIN public.purchases p ON p.id = a.purchase_id AND p.status = 'recorded'
  WHERE a.payment_id = _payment_id AND (_exclude IS NULL OR a.id <> _exclude);
$function$
;

CREATE OR REPLACE FUNCTION app.purchase_allocated(_purchase_id uuid, _exclude uuid DEFAULT NULL::uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(sum(a.amount_inr), 0) FROM public.vendor_payment_allocations a
  JOIN public.vendor_payments v ON v.id = a.payment_id AND v.status = 'recorded'
  WHERE a.purchase_id = _purchase_id AND (_exclude IS NULL OR a.id <> _exclude);
$function$
;

CREATE OR REPLACE FUNCTION app.recalculate_sale_pricing(_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.sale_pricing (sale_id) VALUES (_sale_id)
  ON CONFLICT (sale_id) DO UPDATE SET updated_at = now();
END;
$function$
;

CREATE OR REPLACE FUNCTION app.receipt_allocated(_receipt_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(sum(amount_inr), 0) FROM public.customer_receipt_allocations WHERE receipt_id = _receipt_id;
$function$
;

CREATE OR REPLACE FUNCTION app.sale_accepts_purchases(_sale_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.sales WHERE id = _sale_id AND status <> 'cancelled'::public.sale_status);
$function$
;

CREATE OR REPLACE FUNCTION app.sale_is_editable(_sale_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.sales
    WHERE id = _sale_id
      AND status IN ('pending'::public.sale_status, 'confirmed'::public.sale_status)
  );
$function$
;

CREATE OR REPLACE FUNCTION app.sync_customer_quote_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.cq_recalc', 'on', true);
  UPDATE public.customer_quote_pricing SET markup_type = markup_type
   WHERE customer_quote_id = COALESCE(NEW.customer_quote_id, OLD.customer_quote_id);
  PERFORM set_config('app.cq_recalc', 'off', true);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.sync_sale_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _sale_id uuid := COALESCE(NEW.sale_id, OLD.sale_id);
BEGIN
  PERFORM app.recalculate_sale_pricing(_sale_id);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.sync_sale_pricing_on_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM app.recalculate_sale_pricing(NEW.id);
  RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION app.vendor_payment_is_own_recorded(_payment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.vendor_payments WHERE id = _payment_id AND status = 'recorded' AND created_by = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION app.vendor_payment_is_recorded(_payment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.vendor_payments WHERE id = _payment_id AND status = 'recorded');
$function$
;

CREATE OR REPLACE FUNCTION app.write_audit(_action text, _entity_type text, _entity_id text, _old jsonb, _new jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_log (user_id, action, entity_type, entity_id, old_values, new_values)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, _old, _new);
END;
$function$
;
