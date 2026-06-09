-- 재고에서 개당 용량(container) 개념 제거, 단위 변환(g↔kg, mL↔L)으로 대체
-- 재고 단위는 kg/L/개 기준, 레시피는 g·mL 등으로 입력 후 앱에서 환산

-- deliver_order: container_size 곱 제거 (발주 수량을 재고 단위 그대로 반영)
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
    SELECT oi.ingredient_id, oi.quantity, oi.unit_price
    FROM order_items oi
    WHERE oi.order_id = p_order_id AND oi.ingredient_id IS NOT NULL
  LOOP
    UPDATE ingredients
    SET
      current_stock = current_stock + v_item.quantity,
      last_price = v_item.unit_price,
      updated_at = now()
    WHERE id = v_item.ingredient_id;
  END LOOP;
END;
$$;

-- 컬럼 제거
ALTER TABLE ingredients DROP COLUMN IF EXISTS container_size;
ALTER TABLE ingredients DROP COLUMN IF EXISTS container_unit;
