-- toss_orders에 카드/현금 분리 금액 컬럼 추가
ALTER TABLE toss_orders
  ADD COLUMN IF NOT EXISTS card_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12, 0) NOT NULL DEFAULT 0;
