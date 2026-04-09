-- toss_order_items에 카테고리명, 옵션 선택 컬럼 추가
ALTER TABLE toss_order_items
  ADD COLUMN IF NOT EXISTS category_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS option_choices JSONB NOT NULL DEFAULT '[]';

-- RPC 함수 업데이트: category_name, option_choices 포함
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
    INSERT INTO toss_order_items (
      order_id, store_id,
      item_id, item_name, category_name,
      quantity, unit_price, total_price,
      option_choices
    )
    VALUES (
      v_internal_order_id,
      p_store_id,
      v_item->>'itemId',
      v_item->>'itemName',
      COALESCE(v_item->>'categoryName', ''),
      (v_item->>'quantity')::NUMERIC,
      (v_item->>'unitPrice')::NUMERIC,
      (v_item->>'totalPrice')::NUMERIC,
      COALESCE(v_item->'optionChoices', '[]'::JSONB)
    );
  END LOOP;

  RETURN v_internal_order_id;
END;
$$;
