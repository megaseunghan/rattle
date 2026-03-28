-- Toss Place POS 연동 마이그레이션
-- Supabase SQL Editor에서 실행하세요

-- stores 테이블에 Toss Place 자격증명 컬럼 추가
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS toss_merchant_id TEXT,
  ADD COLUMN IF NOT EXISTS toss_access_key TEXT,
  ADD COLUMN IF NOT EXISTS toss_secret_key TEXT;

-- Toss Place 매출 테이블 생성
CREATE TABLE IF NOT EXISTS toss_sales (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  toss_order_id TEXT NOT NULL UNIQUE,
  order_at TIMESTAMPTZ NOT NULL,
  total_amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'CANCELLED', 'REFUNDED')),
  items JSONB DEFAULT '[]',
  synced_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- RLS 활성화
ALTER TABLE toss_sales ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 본인 매장 매출만 접근
CREATE POLICY "Users can manage own toss sales"
  ON toss_sales FOR ALL
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_toss_sales_store ON toss_sales(store_id);
CREATE INDEX IF NOT EXISTS idx_toss_sales_order_at ON toss_sales(store_id, order_at DESC);
