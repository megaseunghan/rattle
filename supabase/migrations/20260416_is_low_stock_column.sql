-- ingredients.is_low_stock: 품절 임박 여부 자동 계산 컬럼
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS is_low_stock BOOLEAN
  GENERATED ALWAYS AS (current_stock <= min_stock) STORED;

CREATE INDEX IF NOT EXISTS idx_ingredients_low_stock
  ON ingredients (store_id, is_low_stock)
  WHERE is_low_stock = TRUE;
