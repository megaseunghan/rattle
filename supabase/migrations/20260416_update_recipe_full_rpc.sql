-- update_recipe_full: 레시피 기본 정보 + 재료 일괄 교체 (단일 트랜잭션)
CREATE OR REPLACE FUNCTION update_recipe_full(
  p_recipe_id    UUID,
  p_name         TEXT,
  p_category     TEXT,
  p_selling_price NUMERIC,
  p_ingredients  JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE recipes
  SET name = p_name, category = p_category, selling_price = p_selling_price
  WHERE id = p_recipe_id;

  DELETE FROM recipe_ingredients WHERE recipe_id = p_recipe_id;

  IF jsonb_array_length(p_ingredients) > 0 THEN
    INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
    SELECT
      p_recipe_id,
      (elem->>'ingredient_id')::UUID,
      (elem->>'quantity')::NUMERIC,
      elem->>'unit'
    FROM jsonb_array_elements(p_ingredients) AS elem;
  END IF;
END;
$$;
