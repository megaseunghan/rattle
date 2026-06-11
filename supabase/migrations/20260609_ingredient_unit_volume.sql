-- 개수(개)로 관리하는 재고의 "1개당 용량" (레시피에서 g/mL로 사용할 때 원가 환산용).
-- 재고 등록 시 강제하지 않고, 레시피에서 처음 불러올 때 비어 있으면 입력받아 저장.
ALTER TABLE ingredients
  ADD COLUMN IF NOT EXISTS unit_volume NUMERIC,
  ADD COLUMN IF NOT EXISTS unit_volume_unit TEXT;
