-- 파트타이머 시급(분 단위 일일급여 계산용) 컬럼 추가
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS hourly_wage NUMERIC(12, 0);
