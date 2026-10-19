CREATE OR REPLACE FUNCTION app.guard_customer_quote_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _rev boolean := COALESCE(current_setting('app.cq_revision', true), '') = 'on';
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
    RAISE EXCEPTION 'A % customer quote can no longer be edited', OLD.status;
  END IF;
  RETURN NEW;
END;
$$;