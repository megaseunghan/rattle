-- 직원 레코드를 로그인 계정(auth.uid)과 연결 + 출퇴근은 본인만 가능하도록 제한

-- 1) employees.user_id: 직원 ↔ 로그인 계정 연결
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 한 계정이 한 매장에서 두 직원에 연결되지 않도록
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_store_user
  ON employees (store_id, user_id)
  WHERE user_id IS NOT NULL;

-- 2) attendance 정책 재구성: 조회는 매장 멤버, 기록(INSERT)은 본인만
DROP POLICY IF EXISTS "attendance_store_member" ON attendance;

-- 조회: 매장 오너 또는 승인된 멤버
CREATE POLICY "attendance_select_store_member" ON attendance
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM stores WHERE owner_id = auth.uid()
      UNION
      SELECT store_id FROM store_members WHERE user_id = auth.uid() AND status = 'approved'
    )
  );

-- 기록: 본인 계정에 연결된 직원 레코드로만 출퇴근 가능
CREATE POLICY "attendance_insert_self" ON attendance
  FOR INSERT WITH CHECK (
    employee_id IN (SELECT id FROM employees WHERE user_id = auth.uid())
  );

-- 정정/삭제: 매장 오너 또는 admin 멤버 (대리 정정)
CREATE POLICY "attendance_modify_admin" ON attendance
  FOR DELETE USING (
    store_id IN (
      SELECT id FROM stores WHERE owner_id = auth.uid()
      UNION
      SELECT store_id FROM store_members WHERE user_id = auth.uid() AND role = 'admin' AND status = 'approved'
    )
  );
