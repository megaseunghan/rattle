-- 화면 10/11: 매출 수기 입력 (Toss POS 미연동 매장 또는 POS 외 매출 보완용)

CREATE TABLE IF NOT EXISTS manual_sales (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date           DATE NOT NULL,
  amount         NUMERIC(12, 0) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('card', 'cash', 'delivery')),
  memo           TEXT,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE manual_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manual_sales_store_member" ON manual_sales FOR ALL USING (
  is_store_member(store_id)
) WITH CHECK (
  is_store_member(store_id)
);

CREATE INDEX IF NOT EXISTS idx_manual_sales_store_date ON manual_sales (store_id, date DESC);
