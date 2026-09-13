ALTER TYPE public.sale_cost_type RENAME VALUE 'dmc' TO 'tour_package';
ALTER TABLE public.sale_costs DROP COLUMN source_type;
DROP TYPE public.cost_source_type;