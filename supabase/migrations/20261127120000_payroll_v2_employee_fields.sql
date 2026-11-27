-- 목적: 급여 계산 2026-v2에 필요한 직원·매장 필드를 더한다.
--   - employees.income_type: 근로자 / 프리랜서(3.3%). 근무시간으로 3.3%를 자동 결정하지 않는다.
--   - employees.weekly_minutes: 주 소정 근무시간(분, 10분 단위). 기존 정수 weekly_hours는 보존하고 분으로 옮긴다.
--   - employees.weekly_rest_included: 시급에 주휴수당 포함 여부(null = 정하지 않음).
--   - employees.probation_ends_on: 수습 마지막 날(포함). 사장님이 수습으로 표시한 직원에게만 의미가 있다.
--   - stores.default_probation_months/days: 매장 기본 수습 기간(둘 다 null = 없음).
-- 정책 문서: docs/intent/급여-계산-바로잡기.md(「정한 것」「계획 확인 중 추가 결정」), docs/intent/매장-만들기-마저-채우기.md.
-- 선행 파일: 20260602_employees_payroll.sql(weekly_hours·is_probation·probation_started_at),
--   20261118160000_join_wage_required.sql(approve_join_onboarding이 weekly_hours를 쓴다).
-- 기존 자료(사용자 결정 2026-11-27, 개발 중): 모든 직원 income_type='employee',
--   is_probation=true 직원은 수습 시작일(없으면 입사일)부터 61일(기존 앱 규칙과 같은 기간)을 수습 기간으로 넣는다.
--   이미 작성된 월 명세(payroll)는 바꾸지 않는다.
-- 합류 승인 호환: approve_join_onboarding은 아직 weekly_hours만 쓰므로, weekly_hours가 바뀌고 weekly_minutes를
--   직접 주지 않은 쓰기는 트리거가 weekly_minutes = weekly_hours × 60으로 맞춘다.
-- 재실행: ADD COLUMN IF NOT EXISTS, 제약은 이름 확인 후 추가, 백필은 비어 있는 값만 채운다.
BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS income_type text NOT NULL DEFAULT 'employee',
  ADD COLUMN IF NOT EXISTS weekly_minutes integer,
  ADD COLUMN IF NOT EXISTS weekly_rest_included boolean,
  ADD COLUMN IF NOT EXISTS probation_ends_on date;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS default_probation_months smallint,
  ADD COLUMN IF NOT EXISTS default_probation_days smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_income_type_check') THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_income_type_check
      CHECK (income_type IN ('employee', 'freelancer'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_weekly_minutes_check') THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_weekly_minutes_check
      CHECK (weekly_minutes IS NULL OR weekly_minutes BETWEEN 0 AND 10080) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_default_probation_check') THEN
    ALTER TABLE public.stores ADD CONSTRAINT stores_default_probation_check CHECK (
      (default_probation_months IS NULL OR default_probation_months IN (1, 2, 3))
      AND (default_probation_days IS NULL OR default_probation_days BETWEEN 1 AND 90)
      AND NOT (default_probation_months IS NOT NULL AND default_probation_days IS NOT NULL));
  END IF;
END $$;

-- 기존 정수 시간을 분으로 옮긴다(비어 있는 값만).
UPDATE public.employees
   SET weekly_minutes = weekly_hours * 60
 WHERE weekly_minutes IS NULL AND weekly_hours IS NOT NULL AND weekly_hours BETWEEN 0 AND 168;

-- 기존 수습 표시 직원: 시작일부터 61일(마지막 날 포함 = 시작일 + 60일).
UPDATE public.employees
   SET probation_ends_on = coalesce(probation_started_at::date, joined_at) + 60
 WHERE is_probation AND probation_ends_on IS NULL AND coalesce(probation_started_at::date, joined_at) IS NOT NULL;

-- 원격 employees에는 지연(DEFERRABLE) 제약 트리거가 있다. 백필 UPDATE 뒤 ALTER TABLE 전에 대기 중인 검사를 먼저 끝낸다
-- (안 하면 55006 'pending trigger events'로 실패).
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.employees VALIDATE CONSTRAINT employees_weekly_minutes_check;

CREATE OR REPLACE FUNCTION private.sync_employee_weekly_minutes() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.weekly_minutes IS NULL AND NEW.weekly_hours IS NOT NULL THEN NEW.weekly_minutes := NEW.weekly_hours * 60; END IF;
  ELSIF NEW.weekly_hours IS DISTINCT FROM OLD.weekly_hours AND NEW.weekly_minutes IS NOT DISTINCT FROM OLD.weekly_minutes THEN
    NEW.weekly_minutes := CASE WHEN NEW.weekly_hours IS NULL THEN NULL ELSE NEW.weekly_hours * 60 END;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.sync_employee_weekly_minutes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employees_sync_weekly_minutes ON public.employees;
CREATE TRIGGER employees_sync_weekly_minutes BEFORE INSERT OR UPDATE OF weekly_hours, weekly_minutes ON public.employees
  FOR EACH ROW EXECUTE FUNCTION private.sync_employee_weekly_minutes();

COMMENT ON COLUMN public.employees.income_type IS '소득 구분: employee(근로자) / freelancer(3.3%). 일용근로자는 daily_laborers로 관리';
COMMENT ON COLUMN public.employees.weekly_minutes IS '주 소정 근무시간(분). null이면 공제하지 않고 입력 안내';
COMMENT ON COLUMN public.employees.weekly_rest_included IS '시급에 주휴수당 포함 여부. null = 정하지 않음';
COMMENT ON COLUMN public.employees.probation_ends_on IS '수습 마지막 날(포함). is_probation일 때만 90% 적용';
COMMENT ON COLUMN public.employees.is_resigned_during_probation IS '사용 중지(2026-v2): 수습 중 퇴사 80% 규칙 제거. 기존 값 보존용';

COMMIT;
