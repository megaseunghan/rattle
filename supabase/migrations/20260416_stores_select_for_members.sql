-- 승인된 멤버도 소속 매장을 SELECT 할 수 있도록 RLS 정책 추가
-- stores(*)  join이 RLS에 막혀 null을 반환하는 문제 수정

CREATE POLICY "stores_select_member" ON stores
  FOR SELECT USING (
    owner_id = auth.uid()
    OR id IN (
      SELECT store_id FROM store_members
      WHERE user_id = auth.uid()
        AND status = 'approved'
    )
  );
