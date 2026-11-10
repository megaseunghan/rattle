-- Keep client and server recipe-cost conversion consistent.
-- oz is the avoirdupois mass ounce, not a fluid ounce.
-- No stored quantities, prices, or historical purchases are changed.
BEGIN;
CREATE OR REPLACE FUNCTION public.unit_base_factor(p_unit text)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE p_unit
   WHEN 'mg' THEN 0.000001
   WHEN 'g' THEN 0.001
   WHEN 'oz' THEN 0.028349523125
   WHEN 'ml' THEN 0.001
   WHEN 'mL' THEN 0.001
   ELSE 1
 END::numeric
$$;
COMMIT;
