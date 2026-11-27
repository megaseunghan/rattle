-- 목적: 파트타이머 일별 근무(payroll_daily_work)에도 수습 90%를 날짜별로 넣는다(사용자 결정 2026-11-27, 교차검증 M2).
--   지금까지 QR 자동 기록·직접 입력 경로는 급여 이력의 시급을 그대로 써서, 화면의 '수습 · 90%'와 실제 금액이 달랐다.
-- 방식: 행을 새로 만들거나 적용 시급이 새로 정해질 때(값이 바뀔 때)만, 그 근무일이 수습 기간이면
--   applied_hourly_wage를 시급 × 0.9로 바꾸고 gross를 다시 계산한다(기존 CHECK gross = round(분 × 시급 / 60) 유지).
--   적용 시급이 그대로인 수정(상태 검토·메모 등)은 건드리지 않으므로 이미 반영된 값에 두 번 곱하지 않는다.
-- 수습 판단: lib/payroll/probation.ts isProbationOn과 같다 — is_probation이고 probation_ends_on이 있으며
--   coalesce(probation_started_at, joined_at) ≤ 근무일 ≤ probation_ends_on.
-- 기존 자료: 이미 저장된 일별 행·월 명세·스냅샷은 바꾸지 않는다(트리거는 앞으로의 쓰기에만 동작).
-- 정책 문서: docs/intent/급여-계산-바로잡기.md. 선행 파일: 20261027011000_daily_work_snapshots.sql(payroll_daily_work),
--   20261127120000_payroll_v2_employee_fields.sql(probation_ends_on).
-- 트리거 순서: BEFORE 트리거는 이름순으로 실행된다. QR 자동 반영 허가 검사(guard_attendance_work_review,
--   manager_self_attendance_guard)는 허가에 적힌 원래 시급·금액(to_jsonb(NEW) @> expected)과 비교하므로,
--   이 트리거 이름(payroll_daily_work_probation)은 그보다 뒤에 오도록 유지한다. 이름을 바꾸지 않는다.
-- 재실행: 함수 CREATE OR REPLACE, 트리거 DROP 후 생성.
BEGIN;

CREATE OR REPLACE FUNCTION private.apply_part_time_probation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE e public.employees%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.applied_hourly_wage IS NOT DISTINCT FROM OLD.applied_hourly_wage THEN RETURN NEW; END IF;
  -- INSERT … ON CONFLICT DO UPDATE: 같은 날 행이 이미 있으면 모든 작성 경로가 기존 행의 적용 시급을 다시 쓰므로
  -- (이미 반영된 값) 제안 행에 다시 곱하지 않는다. 실제 갱신 행은 UPDATE 분기가 판단한다.
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.payroll_daily_work d WHERE d.employee_id = NEW.employee_id AND d.work_date = NEW.work_date) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO e FROM public.employees WHERE id = NEW.employee_id;
  IF e.id IS NOT NULL AND e.is_probation AND e.probation_ends_on IS NOT NULL
    AND coalesce(e.probation_started_at::date, e.joined_at) IS NOT NULL
    AND NEW.work_date BETWEEN coalesce(e.probation_started_at::date, e.joined_at) AND e.probation_ends_on THEN
    NEW.applied_hourly_wage := round(NEW.applied_hourly_wage * 0.9, 4);
    NEW.gross := round(NEW.worked_minutes * NEW.applied_hourly_wage / 60);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.apply_part_time_probation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payroll_daily_work_probation ON public.payroll_daily_work;
CREATE TRIGGER payroll_daily_work_probation BEFORE INSERT OR UPDATE OF applied_hourly_wage ON public.payroll_daily_work
  FOR EACH ROW EXECUTE FUNCTION private.apply_part_time_probation();

COMMENT ON FUNCTION private.apply_part_time_probation() IS '파트타이머 수습 기간 근무일의 적용 시급을 90%로(새 시급이 정해질 때만, 2026-v2)';

COMMIT;
