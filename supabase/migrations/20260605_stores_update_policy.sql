-- stores 오너가 자신의 매장을 UPDATE할 수 있도록 RLS 정책 추가
CREATE POLICY "stores_update_owner" ON stores
  FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
