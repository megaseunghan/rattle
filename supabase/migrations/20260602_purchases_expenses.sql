-- 매입 테이블
CREATE TABLE IF NOT EXISTS purchases (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  supplier     TEXT NOT NULL DEFAULT '',
  amount       NUMERIC(12, 0) NOT NULL DEFAULT 0,
  category     TEXT NOT NULL DEFAULT '기타'
                 CHECK (category IN ('식자재','비품','소모품','주류','기타')),
  type         TEXT NOT NULL DEFAULT '수기'
                 CHECK (type IN ('전자세금계산서','쿠팡','네이버','수기')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchases_store_member" ON purchases
  FOR ALL
  USING (
    store_id IN (
      SELECT id FROM stores WHERE owner_id = auth.uid()
      UNION
      SELECT store_id FROM store_members
        WHERE user_id = auth.uid() AND status = 'approved'
    )
  );

-- 비용 테이블
CREATE TABLE IF NOT EXISTS expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  year_month   CHAR(7) NOT NULL,  -- 'YYYY-MM'
  category     TEXT NOT NULL
                 CHECK (category IN ('마케팅','고정비','시설보수','공과금')),
  name         TEXT NOT NULL DEFAULT '',
  amount       NUMERIC(12, 0) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_store_member" ON expenses
  FOR ALL
  USING (
    store_id IN (
      SELECT id FROM stores WHERE owner_id = auth.uid()
      UNION
      SELECT store_id FROM store_members
        WHERE user_id = auth.uid() AND status = 'approved'
    )
  );

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_purchases_store_date  ON purchases (store_id, date);
CREATE INDEX IF NOT EXISTS idx_expenses_store_month  ON expenses (store_id, year_month);
