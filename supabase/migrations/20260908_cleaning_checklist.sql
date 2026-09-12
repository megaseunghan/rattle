-- 청소 체크리스트 (화면 27 오픈/마감/요일별, 28 편집)
-- 참고: is_store_member() 헬퍼는 20260608_role_based_rls.sql 에서 정의됨.

CREATE TABLE IF NOT EXISTS cleaning_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  segment TEXT NOT NULL CHECK (segment IN ('open', 'close', 'weekday')),
  weekday SMALLINT CHECK (weekday BETWEEN 0 AND 6), -- segment='weekday'일 때만 사용 (0=일요일)
  title TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cleaning_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES cleaning_items(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  checked_by UUID NOT NULL REFERENCES auth.users(id),
  checked_by_name TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_id, date)
);

CREATE INDEX IF NOT EXISTS cleaning_items_store_segment_idx ON cleaning_items (store_id, segment, sort_order);
CREATE INDEX IF NOT EXISTS cleaning_logs_store_date_idx ON cleaning_logs (store_id, date);

ALTER TABLE cleaning_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cleaning_items_member_all" ON cleaning_items;
CREATE POLICY "cleaning_items_member_all" ON cleaning_items
  FOR ALL USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));

DROP POLICY IF EXISTS "cleaning_logs_member_all" ON cleaning_logs;
CREATE POLICY "cleaning_logs_member_all" ON cleaning_logs
  FOR ALL USING (is_store_member(store_id)) WITH CHECK (is_store_member(store_id));
