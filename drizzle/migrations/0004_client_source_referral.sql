ALTER TABLE public.clients
  ADD COLUMN source text,
  ADD COLUMN referred_by text;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_source_check CHECK (source IS NULL OR source IN ('Referral','Repeat client','Instagram','Facebook','WhatsApp','Google','Website','Walk-in','Other')),
  ADD CONSTRAINT clients_referred_by_check CHECK (referred_by IS NULL OR (char_length(referred_by) <= 120 AND source = 'Referral'));