-- 재료가 비어 있거나 한 재료의 단가라도 확인할 수 없으면 원가와 마진율을 함께 보류한다.
CREATE OR REPLACE VIEW public.recipe_costs WITH (security_invoker=true) AS
SELECT r.id AS recipe_id,r.store_id,c.cost,
  CASE WHEN c.cost IS NULL THEN NULL
       WHEN r.selling_price>0 THEN (r.selling_price-c.cost)/r.selling_price*100
       ELSE 0 END AS margin_rate
FROM public.recipes r
CROSS JOIN LATERAL (
  SELECT CASE WHEN count(*)>0 AND count(i.last_price)=count(*)
    THEN sum(public.recipe_line_cost(ri.quantity,coalesce(ri.unit,i.unit),i.unit,
      i.last_price,i.unit_volume,i.unit_volume_unit)) END AS cost
  FROM public.recipe_ingredients ri
  LEFT JOIN public.ingredients i ON i.id=ri.ingredient_id AND i.store_id=r.store_id
  WHERE ri.recipe_id=r.id
) c;
