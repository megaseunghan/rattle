-- 재고(ingredients)에서 거래처(supplier_name) 제거
-- 발주처는 발주(OCR)에서 받으므로 재고에는 불필요
ALTER TABLE ingredients DROP COLUMN IF EXISTS supplier_name;
