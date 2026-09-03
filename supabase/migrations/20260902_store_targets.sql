-- 매장별 목표 인건비율/매출원가율(매입 비중) 설정
alter table stores
  add column if not exists labor_ratio_target numeric not null default 30,
  add column if not exists cogs_ratio_target numeric not null default 40;