-- ============================================
-- Rattle — Supabase DB Schema
-- SQL Editor에서 이 파일을 실행하세요
-- ============================================

-- 1. 매장 테이블
CREATE TABLE stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. 식자재 (재고) 테이블
CREATE TABLE ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT '기타',
  current_stock NUMERIC DEFAULT 0,
  unit TEXT DEFAULT 'g',
  min_stock NUMERIC DEFAULT 0,
  last_price NUMERIC DEFAULT 0,
  container_unit TEXT,
  container_size NUMERIC,
  supplier_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. 발주 테이블
CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  supplier_name TEXT DEFAULT '',
  order_date DATE DEFAULT CURRENT_DATE,
  total_amount NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'delivered')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. 발주 항목 테이블
CREATE TABLE order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT DEFAULT 'g',
  unit_price NUMERIC DEFAULT 0,
  subtotal NUMERIC DEFAULT 0
);

-- 5. 레시피 테이블
CREATE TABLE recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT '기타',
  selling_price NUMERIC DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  margin_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 6. 레시피 재료 테이블
CREATE TABLE recipe_ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE NOT NULL,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  quantity NUMERIC NOT NULL,
  unit TEXT DEFAULT 'g'
);

-- 7. OCR 결과 테이블
CREATE TABLE ocr_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT,
  raw_text TEXT,
  parsed_items JSONB DEFAULT '[]',
  status TEXT DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- Row Level Security (RLS) 정책
-- 매장 owner만 자기 데이터에 접근 가능
-- ============================================

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_results ENABLE ROW LEVEL SECURITY;

-- stores: 본인 매장만
CREATE POLICY "Users can view own stores"
  ON stores FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can create stores"
  ON stores FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own stores"
  ON stores FOR UPDATE
  USING (owner_id = auth.uid());

-- NOTE: 매장 삭제는 의도적으로 비허용 (데이터 보호)
CREATE POLICY "Users cannot delete stores"
  ON stores FOR DELETE
  USING (false);

-- ingredients: 본인 매장의 재료만
CREATE POLICY "Users can manage own ingredients"
  ON ingredients FOR ALL
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- orders: 본인 매장 발주만
CREATE POLICY "Users can manage own orders"
  ON orders FOR ALL
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- order_items: 본인 발주의 항목만
CREATE POLICY "Users can manage own order items"
  ON order_items FOR ALL
  USING (order_id IN (
    SELECT id FROM orders WHERE store_id IN (
      SELECT id FROM stores WHERE owner_id = auth.uid()
    )
  ));

-- recipes: 본인 매장 레시피만
CREATE POLICY "Users can manage own recipes"
  ON recipes FOR ALL
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- recipe_ingredients: 본인 레시피의 재료만
CREATE POLICY "Users can manage own recipe ingredients"
  ON recipe_ingredients FOR ALL
  USING (recipe_id IN (
    SELECT id FROM recipes WHERE store_id IN (
      SELECT id FROM stores WHERE owner_id = auth.uid()
    )
  ));

-- ocr_results: 본인 매장 OCR만
CREATE POLICY "Users can manage own ocr results"
  ON ocr_results FOR ALL
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- ============================================
-- 인덱스 (성능 최적화)
-- ============================================
CREATE INDEX idx_stores_owner ON stores(owner_id);
CREATE INDEX idx_ingredients_store ON ingredients(store_id);
CREATE INDEX idx_orders_store ON orders(store_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_recipes_store ON recipes(store_id);
CREATE INDEX idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);
CREATE INDEX idx_ocr_results_store ON ocr_results(store_id);

-- ============================================
-- RPC 함수 (트랜잭션 보장)
-- ============================================

-- 발주 + 항목 원자적 생성
CREATE OR REPLACE FUNCTION create_order_with_items(
  p_store_id UUID,
  p_supplier_name TEXT,
  p_order_date DATE,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_item JSONB;
  v_subtotal NUMERIC;
  v_total NUMERIC := 0;
BEGIN
  -- 호출자가 해당 매장의 owner인지 검증
  IF NOT EXISTS (
    SELECT 1 FROM stores WHERE id = p_store_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: store not found or access denied';
  END IF;

  -- orders 레코드 삽입
  INSERT INTO orders (store_id, supplier_name, order_date, status)
  VALUES (p_store_id, p_supplier_name, p_order_date, 'pending')
  RETURNING id INTO v_order_id;

  -- 각 항목 삽입
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_subtotal := (v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC;
    v_total := v_total + v_subtotal;

    INSERT INTO order_items (order_id, ingredient_id, quantity, unit, unit_price, subtotal)
    VALUES (
      v_order_id,
      (v_item->>'ingredient_id')::UUID,
      (v_item->>'quantity')::NUMERIC,
      v_item->>'unit',
      (v_item->>'unit_price')::NUMERIC,
      v_subtotal
    );
  END LOOP;

  -- 총액 업데이트
  UPDATE orders SET total_amount = v_total WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;

-- 레시피 + 재료 원자적 생성
CREATE OR REPLACE FUNCTION create_recipe_with_ingredients(
  p_store_id UUID,
  p_name TEXT,
  p_category TEXT,
  p_selling_price NUMERIC,
  p_ingredients JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipe_id UUID;
  v_ingredient JSONB;
  v_cost NUMERIC := 0;
  v_margin_rate NUMERIC := 0;
  v_last_price NUMERIC;
BEGIN
  -- 호출자가 해당 매장의 owner인지 검증
  IF NOT EXISTS (
    SELECT 1 FROM stores WHERE id = p_store_id AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: store not found or access denied';
  END IF;

  -- recipes 레코드 삽입
  INSERT INTO recipes (store_id, name, category, selling_price, cost, margin_rate)
  VALUES (p_store_id, p_name, p_category, p_selling_price, 0, 0)
  RETURNING id INTO v_recipe_id;

  -- 각 재료 삽입 및 원가 계산
  FOR v_ingredient IN SELECT * FROM jsonb_array_elements(p_ingredients)
  LOOP
    -- 식자재의 최근 단가 조회
    SELECT last_price INTO v_last_price
    FROM ingredients
    WHERE id = (v_ingredient->>'ingredient_id')::UUID;

    v_cost := v_cost + (v_ingredient->>'quantity')::NUMERIC * COALESCE(v_last_price, 0);

    INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
    VALUES (
      v_recipe_id,
      (v_ingredient->>'ingredient_id')::UUID,
      (v_ingredient->>'quantity')::NUMERIC,
      v_ingredient->>'unit'
    );
  END LOOP;

  -- 마진율 계산 (selling_price > 0일 때)
  IF p_selling_price > 0 THEN
    v_margin_rate := (p_selling_price - v_cost) / p_selling_price * 100;
  END IF;

  -- 원가, 마진율 업데이트
  UPDATE recipes SET cost = v_cost, margin_rate = v_margin_rate WHERE id = v_recipe_id;

  RETURN v_recipe_id;
END;
$$;

-- 발주 배송 완료: 상태 변경 + 재고 자동 업데이트
CREATE OR REPLACE FUNCTION deliver_order(
  p_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
BEGIN
  -- 호출자가 해당 발주의 매장 owner인지 검증
  IF NOT EXISTS (
    SELECT 1 FROM orders o
    JOIN stores s ON s.id = o.store_id
    WHERE o.id = p_order_id AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Unauthorized: order not found or access denied';
  END IF;

  -- 발주 상태를 delivered로 변경
  UPDATE orders SET status = 'delivered' WHERE id = p_order_id;

  -- 각 발주 항목의 재고 증가 + 최근 단가 업데이트
  FOR v_item IN
    SELECT oi.ingredient_id, oi.quantity, oi.unit_price, i.container_size
    FROM order_items oi
    LEFT JOIN ingredients i ON i.id = oi.ingredient_id
    WHERE oi.order_id = p_order_id AND oi.ingredient_id IS NOT NULL
  LOOP
    UPDATE ingredients
    SET
      current_stock = current_stock + v_item.quantity * COALESCE(v_item.container_size, 1),
      last_price = v_item.unit_price,
      updated_at = now()
    WHERE id = v_item.ingredient_id;
  END LOOP;
END;
$$;
