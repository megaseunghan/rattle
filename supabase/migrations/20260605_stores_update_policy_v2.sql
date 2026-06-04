-- 기존 정책 제거 후 오너 + admin 멤버 모두 UPDATE 가능하도록 재생성
DROP POLICY IF EXISTS "stores_update_owner" ON stores;

CREATE POLICY "stores_update_owner_or_admin" ON stores
  FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT store_id FROM store_members
      WHERE user_id = auth.uid()
        AND role = 'admin'
        AND status = 'approved'
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR id IN (
      SELECT store_id FROM store_members
      WHERE user_id = auth.uid()
        AND role = 'admin'
        AND status = 'approved'
    )
  );
