-- 매출 수기 입력을 결제수단별 단일행(하루 1건)으로 재설계 — 현금/카드를 동시에 입력하고 할인액도 기록

ALTER TABLE manual_sales
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_amount NUMERIC(12, 0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 0) NOT NULL DEFAULT 0;

-- 기존 amount/payment_method 데이터를 새 컬럼으로 이관
UPDATE manual_sales SET cash_amount = amount WHERE payment_method IN ('cash', 'delivery');
UPDATE manual_sales SET card_amount = amount WHERE payment_method = 'card';

ALTER TABLE manual_sales DROP COLUMN IF EXISTS amount;
ALTER TABLE manual_sales DROP COLUMN IF EXISTS payment_method;

ALTER TABLE manual_sales ADD CONSTRAINT manual_sales_positive_total
  CHECK (cash_amount + card_amount >= 0);

-- 매장·날짜 기준 하루 1건 — 다시 입력하면 그날 값을 수정하는 방식(upsert)