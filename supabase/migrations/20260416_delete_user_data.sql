-- 회원 탈퇴: 사용자의 모든 데이터 및 Auth 계정 삭제
CREATE OR REPLACE FUNCTION delete_user_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_store_ids uuid[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 소유 매장 ID 목록
  SELECT ARRAY(SELECT id FROM stores WHERE owner_id = v_user_id)
  INTO v_store_ids;

  -- 연관 데이터 삭제 (외래키 순서 준수)
  DELETE FROM toss_order_items WHERE store_id = ANY(v_store_ids);
  DELETE FROM toss_orders      WHERE store_id = ANY(v_store_ids);
  DELETE FROM toss_catalog     WHERE store_id = ANY(v_store_ids);
  DELETE FROM ocr_results      WHERE store_id = ANY(v_store_ids);
  DELETE FROM order_items
    WHERE order_id IN (SELECT id FROM orders WHERE store_id = ANY(v_store_ids));
  DELETE FROM orders           WHERE store_id = ANY(v_store_ids);
  DELETE FROM recipe_ingredients
    WHERE recipe_id IN (SELECT id FROM recipes WHERE store_id = ANY(v_store_ids));
  DELETE FROM recipes          WHERE store_id = ANY(v_store_ids);
  DELETE FROM ingredients      WHERE store_id = ANY(v_store_ids);
  DELETE FROM store_members    WHERE store_id = ANY(v_store_ids);

  -- 다른 매장의 멤버 자격 삭제
  DELETE FROM store_members WHERE user_id = v_user_id;

  -- 매장 삭제
  DELETE FROM stores WHERE owner_id = v_user_id;
END;
$$;
