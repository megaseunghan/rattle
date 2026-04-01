-- stores 테이블에 Toss Place 가맹점 신청 정보 추가
-- toss_access_key / toss_secret_key 는 env로 이전하여 컬럼 불필요

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS business_number TEXT,
  ADD COLUMN IF NOT EXISTS owner_phone     TEXT,
  ADD COLUMN IF NOT EXISTS address         TEXT,
  ADD COLUMN IF NOT EXISTS toss_merchant_id TEXT;

-- 기존에 toss_access_key / toss_secret_key 컬럼이 있으면 제거
ALTER TABLE stores
  DROP COLUMN IF EXISTS toss_access_key,
  DROP COLUMN IF EXISTS toss_secret_key;
