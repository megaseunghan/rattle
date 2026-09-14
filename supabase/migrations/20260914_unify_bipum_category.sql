-- 카테고리 기본값을 '비품소모품' → '비품'으로 통일 (재고/매입 공통: 식자재/주류/비품)

-- 1) 기존 데이터 이관
UPDATE ingredients SET category = '비품' WHERE category = '비품소모품';
UPDATE purchases SET category = '비품' WHERE category = '비품소모품';

-- 2) 매장별로 저장된 카테고리 목록(JSONB/TEXT[])에서 '비품소모품'을 '비품'으로 치환 (중복 제거)
UPDATE stores
SET categories = (
  SELECT COALESCE(jsonb_agg(DISTINCT val), '[]'::jsonb)
  FROM (
    SELECT CASE WHEN value = '"비품소모품"' THEN '"비품"'::jsonb ELSE value END AS val
    FROM jsonb_array_elements(categories)
  ) t
)
WHERE categories @> '["비품소모품"]'::jsonb;

UPDATE stores
SET purchase_categories = (
  SELECT array_agg(DISTINCT val)
  FROM (
    SELECT CASE WHEN elem = '비품소모품' THEN '비품' ELSE elem END AS val
    FROM unnest(purchase_categories) AS elem
  ) t
)
WHERE '비품소모품' = ANY(purchase_categories);

-- 3) 신규 매장 기본값 갱신
ALTER TABLE stores ALTER COLUMN categories SET DEFAULT '["식자재", "주류", "비품"]'::jsonb;
ALTER TABLE stores ALTER COLUMN purchase_categories SET DEFAULT ARRAY['식자재', '주류', '비품'];

-- 4) purchases.category는 매장별 커스텀 카테고리를 허용하는 자유 텍스트 컬럼이라
--    고정 CHECK 제약을 걸면 안 됨 (20260903_purchase_categories.sql에서 바로 이 이유로 제거했음).
--    여기서는 다시 추가하지 않는다.

-- 5) 매입 카테고리 매핑 함수 갱신 (비품/소모품/비품소모품 → '비품')
CREATE OR REPLACE FUNCTION map_purchase_category(p_cat TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_cat IN ('식자재', '비품', '주류', '기타') THEN p_cat
    WHEN p_cat ILIKE '%비품%' OR p_cat ILIKE '%소모품%' THEN '비품'
    WHEN p_cat ILIKE '%주류%' THEN '주류'
    WHEN p_cat ILIKE '%식자재%' OR p_cat ILIKE '%식재%' THEN '식자재'
    ELSE '기타'
  END;
$$;
