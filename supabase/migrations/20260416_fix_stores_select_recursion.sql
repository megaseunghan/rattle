-- stores_select_member 정책이 store_members를 참조하고
-- store_members_select 정책이 stores를 참조해 무한 재귀 발생
-- SECURITY DEFINER 함수로 분리해 순환 참조를 끊음

CREATE OR REPLACE FUNCTION is_store_member(sid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_members
    WHERE store_id = sid
      AND user_id = auth.uid()
      AND status = 'approved'
  );
$$;

DROP POLICY IF EXISTS "stores_select_member" ON stores;

CREATE POLICY "stores_select_member" ON stores
  FOR SELECT USING (
    owner_id = auth.uid()
    OR is_store_member(id)
  );
