-- store_members_delete 정책에 admin 멤버 조건이 빠져있어 오너가 아닌 관리자는
-- 멤버 제거 버튼을 눌러도 RLS에 막혀 0행이 삭제되고(에러 없이 조용히 실패) UI만 그대로였음.
-- select/update 정책과 동일하게 admin 멤버 조건을 추가한다.
DROP POLICY IF EXISTS "store_members_delete" ON store_members;

CREATE POLICY "store_members_delete" ON store_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR store_id IN (
      SELECT store_id FROM store_members sm2
      WHERE sm2.user_id = auth.uid()
        AND sm2.role = 'admin'
        AND sm2.status = 'approved'
    )
  );
