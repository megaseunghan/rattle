-- 매입 카테고리에서 '비품' / '소모품'을 '비품소모품'으로 통합.
-- (재고 카테고리·매장 기본 카테고리는 이미 '비품소모품'을 사용)

-- 1) 기존 데이터 이관
UPDATE purchases SET category = '비품소모품' WHERE category IN ('비품', '소모품');

-- 2) CHECK 제약 갱신
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_category_check;
ALTER TABLE purchases
  ADD CONSTRAINT purchases_category_check
  CHECK (category IN ('식자재', '비품소모품', '주류', '기타'));

-- 3) 매입 카테고리 매핑 함수 갱신 (비품/소모품/비품소모품 → '비품소모품')
CREATE OR REPLACE FUNCTION map_purchase_category(p_cat TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_cat IN ('식자재', '비품소모품', '주류', '기타') THEN p_cat
    WHEN p_cat ILIKE '%비품%' OR p_cat ILIKE '%소모품%' THEN '비품소모품'
    WHEN p_cat ILIKE '%주류%' THEN '주류'
    WHEN p_cat ILIKE '%식자재%' OR p_cat ILIKE '%식재%' THEN '식자재'
    ELSE '기타'
  END;
$$;
