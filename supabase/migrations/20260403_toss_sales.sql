-- toss_sales 테이블 생성
-- Toss Payments 연동으로 판매 데이터를 저장하는 테이블
-- store_id 기반 RLS 정책으로 보안 적용

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

-- Row Level Security 활성화
ALTER TABLE toss_sales ENABLE ROW LEVEL SECURITY;

-- RLS Policy: 본인 매장 데이터만 조회/수정 가능
CREATE POLICY "toss_sales: 본인 매장만 접근"
  ON toss_sales FOR ALL
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

-- 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_toss_sales_store ON toss_sales(store_id);
CREATE INDEX IF NOT EXISTS idx_toss_sales_order_at ON toss_sales(store_id, order_at DESC);
