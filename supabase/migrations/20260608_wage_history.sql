-- 급여 이력: effective_date 기준으로 시급/월급 변경분을 보존
-- 인상/인하/소급 정정 모두 기록되며, 과거 손익은 당시 유효 급여로 계산되어 보존됨
CREATE TABLE IF NOT EXISTS employee_wage_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id)    ON DELETE CASCADE,
  employee_id    UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,                     -- 이 날짜부터 적용
  base_salary    NUMERIC(12, 0) NOT NULL DEFAULT 0, -- 정규직 월급
  hourly_wage    NUMERIC(12, 0),                    -- 파트타이머 시급
  non_taxable    NUMERIC(12, 0) NOT NULL DEFAULT 0,
  memo           TEXT,                              -- 사유 (인상/인하/징계 등)
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wage_history_emp
  ON employee_wage_history (employee_id, effective_date);

-- 기존 직원 시드: 입사일(없으면 과거 기준)부터 현재 급여 적용
INSERT INTO employee_wage_history (store_id, employee_id, effective_date, base_salary, hourly_wage, non_taxable)
SELECT store_id, id, COALESCE(joined_at, DATE '2000-01-01'), base_salary, hourly_wage, non_taxable
FROM employees e
WHERE NOT EXISTS (
  SELECT 1 FROM employee_wage_history h WHERE h.employee_id = e.id
);

-- ─── RLS ──────────────────────────────────────────────────
ALTER TABLE employee_wage_history ENABLE ROW LEVEL SECURITY;

-- 조회: 매장 멤버
DROP POLICY IF EXISTS wage_history_select ON employee_wage_history;
CREATE POLICY wage_history_select ON employee_wage_history
  FOR SELECT USING (is_store_member(store_id));

-- 변경: 관리자 전용, 단 파트타이머 급여는 매장 멤버도 가능 (기존 employees 정책과 동일 기준)
DROP POLICY IF EXISTS wage_history_insert ON employee_wage_history;
CREATE POLICY wage_history_insert ON employee_wage_history
  FOR INSERT WITH CHECK (
    is_store_admin(store_id)
    OR (
      is_store_member(store_id)
      AND EXISTS (
        SELECT 1 FROM employees e
        WHERE e.id = employee_id AND e.store_id = store_id
          AND e.employment_type = 'part_time'
      )
    )
  );

DROP POLICY IF EXISTS wage_history_update ON employee_wage_history;
CREATE POLICY wage_history_update ON employee_wage_history
  FOR UPDATE USING (is_store_admin(store_id)) WITH CHECK (is_store_admin(store_id));

DROP POLICY IF EXISTS wage_history_delete ON employee_wage_history;
CREATE POLICY wage_history_delete ON employee_wage_history
  FOR DELETE USING (is_store_admin(store_id));
