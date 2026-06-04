-- 매장에 GPS 위치 추가
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- 출퇴근 기록 테이블
CREATE TABLE IF NOT EXISTS attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('clock_in', 'clock_out')),
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT now(),
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  distance_m  INTEGER NOT NULL,  -- 매장까지 거리(m)
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_store_member" ON attendance FOR ALL USING (
  store_id IN (
    SELECT id FROM stores WHERE owner_id = auth.uid()
    UNION
    SELECT store_id FROM store_members WHERE user_id = auth.uid() AND status = 'approved'
  )
);

CREATE INDEX IF NOT EXISTS idx_attendance_store_emp  ON attendance (store_id, employee_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_store_date ON attendance (store_id, timestamp DESC);
