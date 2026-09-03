-- 1) 매입 품목 등록을 카테고리별로 쪼개지 않고 하나의 매입 건(카드)으로 통합.
--    purchase_items에 category를 저장해 손익계산서 카테고리별 집계는 품목 단위로 재계산한다.
-- 2) 매입 품목 수정(수량/단가) RPC 추가 — 재고·last_price·매입 합계를 원자적으로 재계산.

ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS category TEXT;

CREATE OR REPLACE FUNCTION create_purchase_with_items(
  p_store_id UUID,
  p_date DATE,
  p_supplier TEXT,
  p_type TEXT,
  p_items JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_purchase_id UUID;
  v_total NUMERIC;
  v_top_category TEXT;
BEGIN
  IF NOT is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized: store not found or access denied';
  END IF;

  SELECT COALESCE(SUM((elem->>'quantity')::NUMERIC * (elem->>'unit_price')::NUMERIC), 0)
  INTO v_total
  FROM jsonb_array_elements(p_items) AS elem;

  -- purchases.category는 CHECK 제약이 있는 대표값 — 금액이 가장 큰 카테고리로 채운다
  -- (카테고리별 실제 집계는 purchase_items.category 기준으로 별도 계산)
  SELECT map_purchase_category(COALESCE(elem->>'category', '기타'))
  INTO v_top_category
  FROM jsonb_array_elements(p_items) AS elem
  GROUP BY map_purchase_category(COALESCE(elem->>'category', '기타'))
  ORDER BY SUM((elem->>'quantity')::NUMERIC * (elem->>'unit_price')::NUMERIC) DESC
  LIMIT 1;

  INSERT INTO purchases (store_id, date, supplier, amount, category, type, note)
  VALUES (p_store_id, p_date, COALESCE(p_supplier, ''), v_total, COALESCE(v_top_category, '기타'), p_type, NULL)
  RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT elem FROM jsonb_array_elements(p_items) AS elem
  LOOP
    INSERT INTO purchase_items (purchase_id, store_id, ingredient_id, name, quantity, unit, unit_price, subtotal, category)
    VALUES (
      v_purchase_id, p_store_id,
      NULLIF(v_item->>'ingredient_id', '')::UUID,
      COALESCE(v_item->>'name', ''),
      (v_item->>'quantity')::NUMERIC,
      COALESCE(v_item->>'unit', ''),
      (v_item->>'unit_price')::NUMERIC,
      (v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC,
      v_item->>'category'
    );

    IF NULLIF(v_item->>'ingredient_id', '') IS NOT NULL THEN
      UPDATE ingredients
      SET current_stock = current_stock + (v_item->>'quantity')::NUMERIC,
          last_price = (v_item->>'unit_price')::NUMERIC,
          updated_at = now()
      WHERE id = (v_item->>'ingredient_id')::UUID;
    END IF;
  END LOOP;
END;
$$;

-- 매입 품목 수량/단가 수정: 재고 델타 반영 + last_price 갱신 + 매입 합계 재계산
CREATE OR REPLACE FUNCTION update_purchase_item(
  p_item_id UUID,
  p_quantity NUMERIC,
  p_unit_price NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old RECORD;
  v_new_subtotal NUMERIC;
  v_delta_qty NUMERIC;
BEGIN
  SELECT * INTO v_old FROM purchase_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase item not found';
  END IF;
  IF NOT is_store_member(v_old.store_id) THEN
    RAISE EXCEPTION 'Unauthorized: store not found or access denied';
  END IF;

  v_new_subtotal := p_quantity * p_unit_price;
  v_delta_qty := p_quantity - v_old.quantity;

  UPDATE purchase_items
  SET quantity = p_quantity, unit_price = p_unit_price, subtotal = v_new_subtotal
  WHERE id = p_item_id;

  UPDATE purchases
  SET amount = amount - v_old.subtotal + v_new_subtotal
  WHERE id = v_old.purchase_id;

  IF v_old.ingredient_id IS NOT NULL THEN
    UPDATE ingredients
    SET current_stock = current_stock + v_delta_qty,
        last_price = p_unit_price,
        updated_at = now()
    WHERE id = v_old.ingredient_id;
  END IF;
END;
$$;
