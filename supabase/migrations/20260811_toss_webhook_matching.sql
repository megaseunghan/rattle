-- Toss Place 웹훅(서비스코드 방식) 연동 지원
-- 기존: 구글폼 신청 → 가맹점ID 수동입력
-- 신규: 가맹점이 포스에서 서비스코드 입력 → app.installation.created.v1 웹훅 →
--       사업자번호로 자동 매칭 → stores.toss_merchant_id 저장

-- ── 사업자번호 정규화 헬퍼 (숫자만 남김) ──────────────────
-- 웹훅은 "4264301305", 앱 입력은 "426-43-01305" 형식이므로 비교 전 정규화 필요
CREATE OR REPLACE FUNCTION normalize_biz_number(v TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(COALESCE(v, ''), '[^0-9]', '', 'g');
$$;

-- ── 미매칭 설치 큐 ───────────────────────────────────────
-- 웹훅은 도착했으나 사업자번호가 일치하는 매장을 못 찾은 경우 보관.
-- 이후 가맹점이 앱에서 사업자번호를 등록하면 매칭하거나, 관리자가 수동 연결.
CREATE TABLE IF NOT EXISTS toss_pending_installations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  toss_merchant_id TEXT NOT NULL,
  business_number  TEXT,
  merchant_name    TEXT,
  owner_name       TEXT,
  phone_number     TEXT,
  address          TEXT,
  raw_payload      JSONB,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | matched | ignored
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched_store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
  UNIQUE (toss_merchant_id)
);

CREATE INDEX IF NOT EXISTS idx_toss_pending_biznum
  ON toss_pending_installations (normalize_biz_number(business_number));

-- ── 사업자번호로 매장 매칭용 인덱스 ──────────────────────
CREATE INDEX IF NOT EXISTS idx_stores_biznum
  ON stores (normalize_biz_number(business_number));

-- ── 웹훅 멱등 처리용: 처리한 이벤트 ID 기록 ──────────────
CREATE TABLE IF NOT EXISTS toss_webhook_events (
  event_id     TEXT PRIMARY KEY,          -- 웹훅 payload의 id
  event_type   TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 사업자번호로 매장 찾기 (정규화 비교) ─────────────────
-- 웹훅 함수(service_role)에서 호출. 빈 사업자번호는 매칭하지 않음.
CREATE OR REPLACE FUNCTION find_store_by_biznum(p_biznum TEXT)
RETURNS TABLE (id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id FROM stores s
  WHERE p_biznum <> ''
    AND normalize_biz_number(s.business_number) = p_biznum
  LIMIT 1;
$$;
