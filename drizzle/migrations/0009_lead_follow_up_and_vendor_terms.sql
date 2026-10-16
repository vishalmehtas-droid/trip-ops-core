ALTER TABLE public.leads ADD COLUMN follow_up_date date;

ALTER TABLE public.vendors ADD COLUMN payment_terms text;
ALTER TABLE public.vendors ADD COLUMN advance_rule text;
ALTER TABLE public.vendors ADD CONSTRAINT vendors_payment_terms_length CHECK (payment_terms IS NULL OR char_length(payment_terms) <= 500);
ALTER TABLE public.vendors ADD CONSTRAINT vendors_advance_rule_length CHECK (advance_rule IS NULL OR char_length(advance_rule) <= 500);