-- stores 테이블에 마감 시간 추가
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS closing_time TIME DEFAULT '23:00';

-- Toss Place 카탈로그 테이블 생성
CREATE TABLE IF NOT EXISTS toss_catalog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL,
  item_name     TEXT NOT NULL,
  category_name TEXT NOT NULL DEFAULT '',
  price         INTEGER NOT NULL DEFAULT 0,
  is_available  BOOLEAN NOT NULL DEFAULT true,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, item_id)
);

ALTER TABLE toss_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "toss_catalog: store owner only"
  ON toss_catalog
  USING (
    store_id IN (
      SELECT id FROM stores WHERE owner_id = auth.uid()
    )
  );
