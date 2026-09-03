-- 매입 카테고리를 매장별로 자유롭게 추가/수정/삭제할 수 있도록 함
alter table stores
  add column if not exists purchase_categories text[] not null default array['식자재','비품소모품','주류','기타'];

-- purchases.category는 고정 enum CHECK 제약이 있어 사용자가 새 카테고리를 추가하면 INSERT가 막힘.
-- (기존 CHECK 값 '식자재','비품','소모품','주류','기타'는 애초에 코드의 '비품소모품'과도 어긋나 있던 값)
alter table purchases drop constraint if exists purchases_category_check;
