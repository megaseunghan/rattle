-- 화면 42: 급여 정산 리포트 — 정산 완료 여부 추적
alter table payroll
  add column if not exists is_settled boolean not null default false,
  add column if not exists settled_at timestamptz;
