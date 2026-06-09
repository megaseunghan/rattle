-- 재고 허브(재고·발주·레시피)를 매장 멤버에게 개방
-- - 재고/발주/입고: 승인된 매장 멤버(owner + member + part) 가능
-- - 레시피 조회·생성·수정·삭제: 멤버 가능하되 파트타이머는 차단
-- 헬퍼 is_store_member / is_store_admin 은 20260608_role_based_rls.sql 에서 정의됨.

-- ── 파트타이머 판별 헬퍼 ─────────────────────────────────
-- 연결된 직원(employees.user_id)이 part_time 이면 파트타이머로 간주
CREATE OR REPLACE FUNCTION is_store_part_timer(sid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees
    WHERE store_id = sid AND user_id = auth.uid()
      AND employment_type = 'part_time'
  );
$$;

-- 레시피 관리 가능: 매장 멤버이면서 파트타이머가 아님
CREATE OR REPLACE FUNCTION can_manage_recipes(sid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_store_member(sid) AND NOT is_store_part_timer(sid);
$$;

-- ── ingredients: 멤버 전체 접근 ──────────────────────────
DROP POLICY IF EXISTS "Users can manage own ingredients" ON ingredients;
CREATE POLICY "ingredients_member_all" ON ingredients
  FOR ALL USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));

-- ── orders: 멤버 전체 접근 ───────────────────────────────
DROP POLICY IF EXISTS "Users can manage own orders" ON orders;
CREATE POLICY "orders_member_all" ON orders
  FOR ALL USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));

-- ── order_items: 발주 매장의 멤버 ────────────────────────
DROP POLICY IF EXISTS "Users can manage own order items" ON order_items;
CREATE POLICY "order_items_member_all" ON order_items
  FOR ALL
  USING (order_id IN (SELECT id FROM orders WHERE is_store_member(store_id)))
  WITH CHECK (order_id IN (SELECT id FROM orders WHERE is_store_member(store_id)));

-- ── recipes: 멤버 가능, 파트타이머 차단 ──────────────────
DROP POLICY IF EXISTS "Users can manage own recipes" ON recipes;
CREATE POLICY "recipes_manage" ON recipes
  FOR ALL USING (can_manage_recipes(store_id)) WITH CHECK (can_manage_recipes(store_id));

-- ── recipe_ingredients: 멤버 가능, 파트타이머 차단 ───────
DROP POLICY IF EXISTS "Users can manage own recipe ingredients" ON recipe_ingredients;
CREATE POLICY "recipe_ingredients_manage" ON recipe_ingredients
  FOR ALL
  USING (recipe_id IN (SELECT id FROM recipes WHERE can_manage_recipes(store_id)))
  WITH CHECK (recipe_id IN (SELECT id FROM recipes WHERE can_manage_recipes(store_id)));

-- ── RPC: create_order_with_items (멤버 허용) ─────────────
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
  IF NOT is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized: store not found or access denied';
  END IF;

  INSERT INTO orders (store_id, supplier_name, order_date, status)
  VALUES (p_store_id, p_supplier_name, p_order_date, 'pending')
  RETURNING id INTO v_order_id;

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

  UPDATE orders SET total_amount = v_total WHERE id = v_order_id;

  RETURN v_order_id;
END;
$$;

-- ── RPC: deliver_order (멤버 허용) ───────────────────────
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
  IF NOT EXISTS (
    SELECT 1 FROM orders WHERE id = p_order_id AND is_store_member(store_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: order not found or access denied';
  END IF;

  UPDATE orders SET status = 'delivered' WHERE id = p_order_id;

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

-- ── RPC: create_recipe_with_ingredients (관리자만) ───────
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
  IF NOT can_manage_recipes(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized: store not found or access denied';
  END IF;

  INSERT INTO recipes (store_id, name, category, selling_price, cost, margin_rate)
  VALUES (p_store_id, p_name, p_category, p_selling_price, 0, 0)
  RETURNING id INTO v_recipe_id;

  FOR v_ingredient IN SELECT * FROM jsonb_array_elements(p_ingredients)
  LOOP
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

  IF p_selling_price > 0 THEN
    v_margin_rate := (p_selling_price - v_cost) / p_selling_price * 100;
  END IF;

  UPDATE recipes SET cost = v_cost, margin_rate = v_margin_rate WHERE id = v_recipe_id;

  RETURN v_recipe_id;
END;
$$;

-- ── RPC: update_recipe_full (멤버 가능, 파트타이머 차단) ──
-- 기존 정의엔 권한 검사가 없어 SECURITY DEFINER로 RLS를 우회함 → 검사 추가
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
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM recipes WHERE id = p_recipe_id AND can_manage_recipes(store_id)
  ) THEN
    RAISE EXCEPTION 'Unauthorized: recipe not found or access denied';
  END IF;

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
