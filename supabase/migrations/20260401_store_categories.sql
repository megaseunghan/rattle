-- stores 테이블에 동적 카테고리 컬럼 추가
-- 기본값: ['식자재', '주류', '비품소모품']
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS categories JSONB DEFAULT '["식자재", "주류", "비품소모품"]'::jsonb;
