-- store_members: 매장 다중 사용자 역할 관리
CREATE TABLE IF NOT EXISTS store_members (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'member')) DEFAULT 'member',
  status     TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, user_id)
);

ALTER TABLE store_members ENABLE ROW LEVEL SECURITY;

-- 자신의 멤버십 조회 + 관리자는 소속 매장 전체 멤버 조회
CREATE POLICY "store_members_select" ON store_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR store_id IN (
      SELECT store_id FROM store_members sm2
      WHERE sm2.user_id = auth.uid()
        AND sm2.role = 'admin'
        AND sm2.status = 'approved'
    )
  );

-- 본인이 직접 pending 상태로 가입 요청
CREATE POLICY "store_members_insert" ON store_members
  FOR INSERT WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- 관리자(오너 또는 admin 멤버)가 승인/거절 처리
CREATE POLICY "store_members_update" ON store_members
  FOR UPDATE USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR store_id IN (
      SELECT store_id FROM store_members sm2
      WHERE sm2.user_id = auth.uid()
        AND sm2.role = 'admin'
        AND sm2.status = 'approved'
    )
  );

-- 본인 탈퇴 또는 관리자가 강제 제거
CREATE POLICY "store_members_delete" ON store_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

-- 기존 매장 오너를 admin 멤버로 자동 등록
INSERT INTO store_members (store_id, user_id, role, status)
SELECT id, owner_id, 'admin', 'approved'
FROM stores
ON CONFLICT (store_id, user_id) DO NOTHING;

-- 멤버의 매장 접근 권한 확인 헬퍼 함수
CREATE OR REPLACE FUNCTION user_has_store_access(sid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM stores WHERE id = sid AND owner_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM store_members
        WHERE store_id = sid
          AND user_id = auth.uid()
          AND status = 'approved'
      );
$$;

-- 멤버에게 ingredients 접근 허용
CREATE POLICY "ingredients_member_select" ON ingredients
  FOR SELECT USING (user_has_store_access(store_id));

CREATE POLICY "ingredients_member_insert" ON ingredients
  FOR INSERT WITH CHECK (user_has_store_access(store_id));

CREATE POLICY "ingredients_member_update" ON ingredients
  FOR UPDATE USING (user_has_store_access(store_id));

-- 멤버에게 orders 접근 허용
CREATE POLICY "orders_member_select" ON orders
  FOR SELECT USING (user_has_store_access(store_id));

CREATE POLICY "orders_member_insert" ON orders
  FOR INSERT WITH CHECK (user_has_store_access(store_id));

CREATE POLICY "orders_member_update" ON orders
  FOR UPDATE USING (user_has_store_access(store_id));

-- 멤버에게 recipes 접근 허용
CREATE POLICY "recipes_member_select" ON recipes
  FOR SELECT USING (user_has_store_access(store_id));

CREATE POLICY "recipes_member_insert" ON recipes
  FOR INSERT WITH CHECK (user_has_store_access(store_id));

CREATE POLICY "recipes_member_update" ON recipes
  FOR UPDATE USING (user_has_store_access(store_id));

-- 멤버에게 toss_orders 접근 허용
CREATE POLICY "toss_orders_member_select" ON toss_orders
  FOR SELECT USING (user_has_store_access(store_id));

CREATE POLICY "toss_orders_member_insert" ON toss_orders
  FOR INSERT WITH CHECK (user_has_store_access(store_id));

CREATE POLICY "toss_orders_member_update" ON toss_orders
  FOR UPDATE USING (user_has_store_access(store_id));

-- 멤버에게 toss_order_items 접근 허용
CREATE POLICY "toss_order_items_member_select" ON toss_order_items
  FOR SELECT USING (user_has_store_access(store_id));

CREATE POLICY "toss_order_items_member_insert" ON toss_order_items
  FOR INSERT WITH CHECK (user_has_store_access(store_id));

-- 멤버에게 toss_catalog 접근 허용
CREATE POLICY "toss_catalog_member_select" ON toss_catalog
  FOR SELECT USING (user_has_store_access(store_id));

CREATE POLICY "toss_catalog_member_insert" ON toss_catalog
  FOR INSERT WITH CHECK (user_has_store_access(store_id));

CREATE POLICY "toss_catalog_member_update" ON toss_catalog
  FOR UPDATE USING (user_has_store_access(store_id));
