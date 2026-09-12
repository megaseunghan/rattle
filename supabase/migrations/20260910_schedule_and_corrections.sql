-- 화면 21/22/51: 마이페이지 주간 스케줄 + 근태 정정 요청

-- 본인 소유 직원 레코드인지 (출퇴근 본인 확인과 동일한 user_id 연결 기준)
CREATE OR REPLACE FUNCTION is_own_employee(eid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees WHERE id = eid AND user_id = auth.uid()
  );
$$;

-- ── 확정된 주간 스케줄 (직원당 요일별 1행, 승인된 내용만 반영) ──
CREATE TABLE IF NOT EXISTS employee_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=일요일
  is_working  BOOLEAN NOT NULL DEFAULT false,
  start_time  TIME,
  end_time    TIME,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, day_of_week)
);

ALTER TABLE employee_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_schedules_select" ON employee_schedules
  FOR SELECT USING (is_store_member(store_id));

CREATE POLICY "employee_schedules_write" ON employee_schedules
  FOR ALL USING (is_store_admin(store_id)) WITH CHECK (is_store_admin(store_id));

-- ── 스케줄 변경 요청 (직원이 제출 → 사장님 승인 시 employee_schedules에 반영) ──
CREATE TABLE IF NOT EXISTS schedule_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  days         JSONB NOT NULL, -- [{day_of_week, is_working, start_time, end_time}, ...]
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES auth.users(id)
);

ALTER TABLE schedule_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedule_requests_select" ON schedule_requests
  FOR SELECT USING (is_store_member(store_id));

CREATE POLICY "schedule_requests_insert" ON schedule_requests
  FOR INSERT WITH CHECK (is_own_employee(employee_id));

CREATE POLICY "schedule_requests_update" ON schedule_requests
  FOR UPDATE USING (is_store_admin(store_id)) WITH CHECK (is_store_admin(store_id));

-- ── 근태 정정 요청 (직원이 제출 → 사장님 승인 시 attendance에 반영) ──
CREATE TABLE IF NOT EXISTS attendance_corrections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  employee_id         UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  attendance_date     DATE NOT NULL,
  target              TEXT NOT NULL CHECK (target IN ('clock_in', 'clock_out', 'both')),
  original_clock_in   TIMESTAMPTZ,
  original_clock_out  TIMESTAMPTZ,
  requested_clock_in  TIMESTAMPTZ,
  requested_clock_out TIMESTAMPTZ,
  reason              TEXT NOT NULL,
  photo_url           TEXT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         UUID REFERENCES auth.users(id)
);

ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_corrections_select" ON attendance_corrections
  FOR SELECT USING (is_store_member(store_id));

CREATE POLICY "attendance_corrections_insert" ON attendance_corrections
  FOR INSERT WITH CHECK (is_own_employee(employee_id));

CREATE POLICY "attendance_corrections_update" ON attendance_corrections
  FOR UPDATE USING (is_store_admin(store_id)) WITH CHECK (is_store_admin(store_id));

CREATE INDEX IF NOT EXISTS idx_schedule_requests_store_status ON schedule_requests (store_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_corrections_store_status ON attendance_corrections (store_id, status);
