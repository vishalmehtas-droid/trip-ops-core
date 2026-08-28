-- =========================================================
-- 1. ITEM TYPE ENUM
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'sale_item_type' AND n.nspname = 'public') THEN
    CREATE TYPE public.sale_item_type AS ENUM ('hotel', 'flight', 'visa', 'activity', 'transport', 'other');
  END IF;
END
$$;

-- =========================================================
-- 2. TABLE
-- =========================================================
CREATE TABLE public.sales_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id uuid NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  item_type public.sale_item_type NOT NULL,
  description text NOT NULL,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT sales_items_description_not_blank CHECK (length(btrim(description)) > 0)
);

CREATE INDEX sales_items_sale_id_idx ON public.sales_items (sale_id, sort_order, created_at);
CREATE INDEX sales_items_vendor_id_idx ON public.sales_items (vendor_id) WHERE vendor_id IS NOT NULL;

-- Defence in depth: no anon access at all, and authenticated privileges limited
-- to what the policies below allow.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_items TO authenticated;
GRANT ALL ON public.sales_items TO service_role;

ALTER TABLE public.sales_items ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 3. PARENT-SALE EDITABILITY HELPER
-- =========================================================
CREATE OR REPLACE FUNCTION app.sale_is_editable(_sale_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sales
    WHERE id = _sale_id
      AND status IN ('pending'::public.sale_status, 'confirmed'::public.sale_status)
  );
$$;

-- =========================================================
-- 4. RLS POLICIES
-- =========================================================
CREATE POLICY sales_items_select_read_permission ON public.sales_items
  FOR SELECT TO authenticated
  USING (app.has_permission(auth.uid(), 'sales.read'));

CREATE POLICY sales_items_insert_manage ON public.sales_items
  FOR INSERT TO authenticated
  WITH CHECK (
    app.has_permission(auth.uid(), 'sales.manage')
    AND app.sale_is_editable(sale_id)
  );

CREATE POLICY sales_items_update_manage ON public.sales_items
  FOR UPDATE TO authenticated
  USING (
    app.has_permission(auth.uid(), 'sales.manage')
    AND app.sale_is_editable(sale_id)
  )
  WITH CHECK (
    app.has_permission(auth.uid(), 'sales.manage')
    AND app.sale_is_editable(sale_id)
  );

CREATE POLICY sales_items_delete_manage ON public.sales_items
  FOR DELETE TO authenticated
  USING (
    app.has_permission(auth.uid(), 'sales.manage')
    AND app.sale_is_editable(sale_id)
  );

-- =========================================================
-- 5. INTEGRITY GUARDS
-- =========================================================
CREATE OR REPLACE FUNCTION app.guard_sale_item_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.guard_sale_item_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.guard_sale_item_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT app.sale_is_editable(OLD.sale_id) THEN
    RAISE EXCEPTION 'Components can only be removed while the booking is pending or confirmed';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER sales_items_guard_insert BEFORE INSERT ON public.sales_items
  FOR EACH ROW EXECUTE FUNCTION app.guard_sale_item_insert();

CREATE TRIGGER sales_items_guard_update BEFORE UPDATE ON public.sales_items
  FOR EACH ROW EXECUTE FUNCTION app.guard_sale_item_update();

CREATE TRIGGER sales_items_guard_delete BEFORE DELETE ON public.sales_items
  FOR EACH ROW EXECUTE FUNCTION app.guard_sale_item_delete();

CREATE TRIGGER sales_items_set_updated_at BEFORE UPDATE ON public.sales_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 6. TRUSTED AUDIT TRIGGERS
-- =========================================================
CREATE OR REPLACE FUNCTION app.audit_sale_item_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.audit_sale_item_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE OR REPLACE FUNCTION app.audit_sale_item_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
$$;

CREATE TRIGGER sales_items_audit_insert AFTER INSERT ON public.sales_items
  FOR EACH ROW EXECUTE FUNCTION app.audit_sale_item_insert();

CREATE TRIGGER sales_items_audit_update AFTER UPDATE ON public.sales_items
  FOR EACH ROW EXECUTE FUNCTION app.audit_sale_item_update();

CREATE TRIGGER sales_items_audit_delete AFTER DELETE ON public.sales_items
  FOR EACH ROW EXECUTE FUNCTION app.audit_sale_item_delete();