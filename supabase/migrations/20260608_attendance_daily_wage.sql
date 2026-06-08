-- 퇴근 시 근무 분(分)·일일급여를 즉시 계산해 저장 (파트타이머)
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS worked_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS daily_wage     NUMERIC(12, 0);

-- 월별 일일급여 집계용 인덱스
CREATE INDEX IF NOT EXISTS idx_attendance_clockout_wage
  ON attendance (store_id, timestamp)
  WHERE type = 'clock_out';
