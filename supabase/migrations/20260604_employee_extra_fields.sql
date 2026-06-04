-- 직원 테이블에 입사일·연락처·은행 계좌 컬럼 추가
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS joined_at      DATE,
  ADD COLUMN IF NOT EXISTS phone          TEXT,
  ADD COLUMN IF NOT EXISTS bank_name      TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT;
