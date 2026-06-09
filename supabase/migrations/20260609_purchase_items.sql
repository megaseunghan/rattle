-- 매입에 품목 라인 도입 (매입 = 입고). 품목 있으면 재고 자동 증가 + last_price 갱신.
-- 금액만 찍는 매입(품목 없음)도 허용. 카테고리별로 매입 행 분할 → 손익계산서 자동 누적.

CREATE TABLE IF NOT EXISTS purchase_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id  UUID NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  ingredient_id UUID REFERENCES ingredients(id) ON DELETE SET NULL,
  name         TEXT NOT NULL DEFAULT '',
  quantity     NUMERIC NOT NULL DEFAULT 0,
  unit         TEXT NOT NULL DEFAULT '',
  unit_price   NUMERIC NOT NULL DEFAULT 0,
  subtotal     NUMERIC NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items (purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_store ON purchase_items (store_id);

ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_items_member" ON purchase_items
  FOR ALL USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));

-- 재고 카테고리 → 매입 카테고리(enum) 매핑
CREATE OR REPLACE FUNCTION map_purchase_category(p_cat TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_cat IN ('식자재','비품','소모품','주류','기타') THEN p_cat
    WHEN p_cat ILIKE '%비품%' OR p_cat ILIKE '%소모품%' THEN '소모품'
    WHEN p_cat ILIKE '%주류%' THEN '주류'
    WHEN p_cat ILIKE '%식자재%' OR p_cat ILIKE '%식재%' THEN '식자재'
    ELSE '기타'
  END;
$$;

-- 품목 매입 등록: 품목들을 카테고리별 매입 행으로 분할 생성 + 재고 증가 + last_price 갱신
-- p_items: [{ ingredient_id, name, quantity, unit, unit_price, category }]
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
  v_cat TEXT;
  v_purchase_id UUID;
  v_cat_row RECORD;
BEGIN
  IF NOT is_store_member(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized: store not found or access denied';
  END IF;

  -- 카테고리별로 매입 행 생성
  FOR v_cat_row IN
    SELECT map_purchase_category(COALESCE(elem->>'category', '기타')) AS pcat,
           SUM((elem->>'quantity')::NUMERIC * (elem->>'unit_price')::NUMERIC) AS amount
    FROM jsonb_array_elements(p_items) AS elem
    GROUP BY map_purchase_category(COALESCE(elem->>'category', '기타'))
  LOOP
    INSERT INTO purchases (store_id, date, supplier, amount, category, type, note)
    VALUES (p_store_id, p_date, COALESCE(p_supplier, ''), v_cat_row.amount, v_cat_row.pcat, p_type, NULL)
    RETURNING id INTO v_purchase_id;

    -- 해당 카테고리에 속한 품목들을 purchase_items로 저장 + 재고 반영
    FOR v_item IN
      SELECT elem FROM jsonb_array_elements(p_items) AS elem
      WHERE map_purchase_category(COALESCE(elem->>'category', '기타')) = v_cat_row.pcat
    LOOP
      INSERT INTO purchase_items (purchase_id, store_id, ingredient_id, name, quantity, unit, unit_price, subtotal)
      VALUES (
        v_purchase_id, p_store_id,
        NULLIF(v_item->>'ingredient_id', '')::UUID,
        COALESCE(v_item->>'name', ''),
        (v_item->>'quantity')::NUMERIC,
        COALESCE(v_item->>'unit', ''),
        (v_item->>'unit_price')::NUMERIC,
        (v_item->>'quantity')::NUMERIC * (v_item->>'unit_price')::NUMERIC
      );

      IF NULLIF(v_item->>'ingredient_id', '') IS NOT NULL THEN
        UPDATE ingredients
        SET current_stock = current_stock + (v_item->>'quantity')::NUMERIC,
            last_price = (v_item->>'unit_price')::NUMERIC,
            updated_at = now()
        WHERE id = (v_item->>'ingredient_id')::UUID;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;
