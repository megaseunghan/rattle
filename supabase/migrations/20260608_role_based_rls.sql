-- ROLE 기반 RLS: 고정비/정규직 직원은 관리자만 쓰기 가능

-- ── 헬퍼 함수 ────────────────────────────────────────────
-- 승인된 매장 멤버(또는 오너)인지
CREATE OR REPLACE FUNCTION is_store_member(sid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM stores WHERE id = sid AND owner_id = auth.uid()
    UNION
    SELECT 1 FROM store_members
      WHERE store_id = sid AND user_id = auth.uid() AND status = 'approved'
  );
$$;

-- 매장 관리자(오너 또는 admin 멤버)인지
CREATE OR REPLACE FUNCTION is_store_admin(sid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM stores WHERE id = sid AND owner_id = auth.uid()
    UNION
    SELECT 1 FROM store_members
      WHERE store_id = sid AND user_id = auth.uid()
        AND role = 'admin' AND status = 'approved'
  );
$$;

-- ── expenses: 고정비는 관리자만 ──────────────────────────
DROP POLICY IF EXISTS "expenses_store_member" ON expenses;

CREATE POLICY "expenses_select" ON expenses
  FOR SELECT USING (is_store_member(store_id));

CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT WITH CHECK (
    is_store_member(store_id) AND (category <> '고정비' OR is_store_admin(store_id))
  );

CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE
  USING (
    is_store_member(store_id) AND (category <> '고정비' OR is_store_admin(store_id))
  )
  WITH CHECK (
    is_store_member(store_id) AND (category <> '고정비' OR is_store_admin(store_id))
  );

CREATE POLICY "expenses_delete" ON expenses
  FOR DELETE USING (
    is_store_member(store_id) AND (category <> '고정비' OR is_store_admin(store_id))
  );

-- ── employees: 정규직은 관리자만, 삭제는 관리자만 ─────────
DROP POLICY IF EXISTS "employees_store_member" ON employees;

CREATE POLICY "employees_select" ON employees
  FOR SELECT USING (is_store_member(store_id));

CREATE POLICY "employees_insert" ON employees
  FOR INSERT WITH CHECK (
    is_store_member(store_id) AND (employment_type = 'part_time' OR is_store_admin(store_id))
  );

CREATE POLICY "employees_update" ON employees
  FOR UPDATE
  USING (
    is_store_member(store_id) AND (employment_type = 'part_time' OR is_store_admin(store_id))
  )
  WITH CHECK (
    is_store_member(store_id) AND (employment_type = 'part_time' OR is_store_admin(store_id))
  );

CREATE POLICY "employees_delete" ON employees
  FOR DELETE USING (is_store_admin(store_id));
