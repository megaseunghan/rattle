-- store_members SELECT 정책의 자기 참조로 인한 무한 재귀 수정
-- admin 체크를 SECURITY DEFINER 함수로 분리

CREATE OR REPLACE FUNCTION is_store_admin(sid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_members
    WHERE store_id = sid
      AND user_id = auth.uid()
      AND role = 'admin'
      AND status = 'approved'
  );
$$;

DROP POLICY IF EXISTS "store_members_select" ON store_members;

CREATE POLICY "store_members_select" ON store_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_store_admin(store_id)
  );

DROP POLICY IF EXISTS "store_members_update" ON store_members;

CREATE POLICY "store_members_update" ON store_members
  FOR UPDATE USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_store_admin(store_id)
  );
