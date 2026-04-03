-- 변경 이유:
-- 발주를 봉/박스 단위로 입력할 경우, 기존 deliver_order 함수가
-- last_price에 봉당 가격(unit_price)을 그대로 저장하여
-- 레시피 원가 계산 시 기준단위(g/ml/개)당 가격이 틀리는 문제가 있었음.
-- 이를 해결하기 위해 order_items.unit이 ingredients.container_unit과 일치하면
-- unit_price를 container_size로 나눠 기준단위당 가격으로 정규화하여 저장하도록 수정.

CREATE OR REPLACE FUNCTION deliver_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. order status → delivered
  UPDATE orders SET status = 'delivered' WHERE id = p_order_id;

  -- 2. 각 order_item별 재고 증가 + last_price 정규화
  UPDATE ingredients i
  SET
    current_stock = i.current_stock + CASE
      WHEN i.container_unit IS NOT NULL
           AND oi.unit = i.container_unit
           AND i.container_size IS NOT NULL
           AND i.container_size > 0
      THEN oi.quantity * i.container_size
      ELSE oi.quantity
    END,
    last_price = CASE
      WHEN i.container_size IS NOT NULL
           AND i.container_size > 0
           AND oi.unit = i.container_unit
      THEN oi.unit_price / i.container_size  -- 봉당가격 → 기준단위당 가격
      ELSE oi.unit_price                      -- 이미 기준단위당 가격
    END
  FROM order_items oi
  WHERE oi.order_id = p_order_id
    AND oi.ingredient_id = i.id;
END;
$$;
