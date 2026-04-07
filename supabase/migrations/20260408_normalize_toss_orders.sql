-- 1. 테이블 이름 변경
ALTER TABLE IF EXISTS toss_sales RENAME TO toss_orders;

-- 2. 상세 항목 테이블 생성
CREATE TABLE IF NOT EXISTS toss_order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES toss_orders(id) ON DELETE CASCADE,
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  item_id       TEXT, -- Toss 상품 ID
  item_name     TEXT NOT NULL,
  quantity      NUMERIC NOT NULL DEFAULT 1,
  unit_price    NUMERIC NOT NULL DEFAULT 0,
  total_price   NUMERIC NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 3. 기존 JSONB 데이터 이관 (데이터가 있을 경우)
DO $$
DECLARE
  v_row RECORD;
  v_item JSONB;
BEGIN
  FOR v_row IN SELECT id, store_id, items FROM toss_orders WHERE items IS NOT NULL AND jsonb_array_length(items) > 0
  LOOP
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_row.items)
    LOOP
      INSERT INTO toss_order_items (order_id, store_id, item_id, item_name, quantity, unit_price, total_price)
      VALUES (
        v_row.id,
        v_row.store_id,
        v_item->>'itemId',
        v_item->>'itemName',
        (v_item->>'quantity')::NUMERIC,
        (v_item->>'unitPrice')::NUMERIC,
        (v_item->>'totalPrice')::NUMERIC
      );
    END LOOP;
  END LOOP;
END;
$$;

-- 4. 기존 JSONB 컬럼 삭제 (선택 사항이나 깔끔하게 처리)
-- ALTER TABLE toss_orders DROP COLUMN IF EXISTS items;

-- 5. 보안 설정 (RLS)
ALTER TABLE toss_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own toss order items"
  ON toss_order_items FOR ALL
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- 6. 인덱스 설정
CREATE INDEX IF NOT EXISTS idx_toss_order_items_order ON toss_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_toss_order_items_store ON toss_order_items(store_id);

-- 7. 원자적 저장을 위한 RPC 함수 생성
CREATE OR REPLACE FUNCTION upsert_toss_order_with_items(
  p_store_id UUID,
  p_toss_order_id TEXT,
  p_order_at TIMESTAMPTZ,
  p_total_amount NUMERIC,
  p_status TEXT,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_internal_order_id UUID;
  v_item JSONB;
BEGIN
  -- 1. 주문 마스터 Upsert
  INSERT INTO toss_orders (store_id, toss_order_id, order_at, total_amount, status)
  VALUES (p_store_id, p_toss_order_id, p_order_at, p_total_amount, p_status)
  ON CONFLICT (toss_order_id) 
  DO UPDATE SET
    status = EXCLUDED.status,
    total_amount = EXCLUDED.total_amount,
    order_at = EXCLUDED.order_at
  RETURNING id INTO v_internal_order_id;

  -- 2. 기존 상세 항목 삭제 (교체 방식)
  DELETE FROM toss_order_items WHERE order_id = v_internal_order_id;

  -- 3. 새 상세 항목 삽입
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO toss_order_items (order_id, store_id, item_id, item_name, quantity, unit_price, total_price)
    VALUES (
      v_internal_order_id,
      p_store_id,
      v_item->>'itemId',
      v_item->>'itemName',
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unitPrice')::NUMERIC,
      (v_item->>'totalPrice')::NUMERIC
    );
  END LOOP;

  RETURN v_internal_order_id;
END;
$$;
