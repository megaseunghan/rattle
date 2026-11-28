-- 목적: 수습 지급 비율을 고정 90%에서 매장 기본값 + 직원별 비율로 바꾸고, 수습 기간을 '90일'이 아니라
--   '시작일부터 3개월'(달력 개월, 89~92일)로 맞춘다(사용자 결정 2026-11-27, A 세션 전달).
--   매장 기본 수습 기간은 없음/1/2/3개월만 둔다 → stores.default_probation_days 열을 없앤다(원격 사용 0건, 2026-11-27 조회).
--   직원 수습 마지막 날은 시작일(probation_started_at 없으면 입사일) ~ 시작일 + 3개월의 마지막 날 안이어야 한다.
--   마지막 날 = N개월 뒤 같은 날의 전날, 그 달에 같은 날이 없으면 그 달 말일(앱 lib/payroll/period.ts addMonthsInclusiveEnd).
--   기존 자료: 이전 규칙(is_probation → 입사일 포함 61일)은 항상 3개월 안이다. 원격에 수습 마지막 날이 있는 직원 0건(2026-11-27).
--   매장 기본값: stores.default_probation_rate(기본 0.9). 보기는 90%/95%/직접 입력(앱). 90% 미만은 직접 입력으로만 가능하고 막지 않는다.
--   직원별: employees.probation_rate. 수습 직원인데 비어 있으면 저장 시점에 매장 기본값으로 채운다
--   (이후 매장 기본값을 바꿔도 이미 정한 직원 비율은 바뀌지 않는다). 기존 수습 직원은 0.9로 채운다.
-- 계산 반영(이미 적용된 함수의 보정, 20261127122000·124000을 고치지 않는다):
--   get_financial_summaries_v2 정규직 일할 추정의 고정 10% 감액 → (1 − 직원 비율),
--   get_daily_labor_sources 직원 목록에 probation_rate 추가(앱 lib/payroll/probation.ts probationRateOf와 같은 값),
--   private.apply_part_time_probation 파트타이머 일별 근무 트리거의 × 0.9 → × 직원 비율.
-- 가드: 원격 적용본 본문 md5(2026-11-27 조회)와 같을 때만 바꾼다. 다르면 중단한다(PROBATION_RATE_BASE_CHANGED).
-- 기존 자료: 작성된 월 명세·일별 근무 행·스냅샷은 바꾸지 않는다.
-- 정책 문서: docs/intent/급여-계산-바로잡기.md 「교차검증 후 결정」, ui-review-standard 「매장 만들기·마저 채우기」 수습 비율.
-- 선행 파일: 20261127120000(probation_ends_on), 20261127122000(두 함수), 20261127124000(트리거).
-- 재실행: 열 IF NOT EXISTS, 제약 이름 확인, 함수는 가드 통과 시에만 교체(교체 후 재실행하면 가드에서 멈춘다).
BEGIN;

DO $guard$ BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.get_financial_summaries_v2(uuid[],text[],boolean)'::regprocedure)) <> '989bfb31ba905a4a103c85b9fcb7d7e0'
    OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.get_daily_labor_sources(uuid,text)'::regprocedure)) <> '11924cec86ac01d0ed3cf649192e2b9a'
    OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'private.apply_part_time_probation()'::regprocedure)) <> 'a323882776222cf6fbc98a813ca39a50' THEN
    RAISE EXCEPTION 'PROBATION_RATE_BASE_CHANGED';
  END IF;
END $guard$;

ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS default_probation_rate numeric(5,4) NOT NULL DEFAULT 0.9;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS probation_rate numeric(5,4);
-- 일 단위 매장 기본 수습 기간을 없앤다(이 열을 쓰는 복합 CHECK도 함께 지워지므로 개월 검사를 다시 건다).
ALTER TABLE public.stores DROP COLUMN IF EXISTS default_probation_days;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_default_probation_rate_check') THEN
    ALTER TABLE public.stores ADD CONSTRAINT stores_default_probation_rate_check
      CHECK (default_probation_rate > 0 AND default_probation_rate <= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_default_probation_months_check') THEN
    ALTER TABLE public.stores ADD CONSTRAINT stores_default_probation_months_check
      CHECK (default_probation_months IS NULL OR default_probation_months IN (1, 2, 3));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_probation_rate_check') THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_probation_rate_check
      CHECK (probation_rate IS NULL OR (probation_rate > 0 AND probation_rate <= 1));
  END IF;
END $$;

-- 시작일 + 3개월로 계산한 수습 마지막 날의 최댓값(앱 maxProbationEnd와 같다).
CREATE OR REPLACE FUNCTION private.probation_max_end(p_start date) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
  SELECT CASE WHEN extract(day FROM p_start + interval '3 months') < extract(day FROM p_start)
    THEN (p_start + interval '3 months')::date        -- 같은 날이 없으면 그 달 말일(PG가 말일로 맞춤)
    ELSE (p_start + interval '3 months')::date - 1 END  -- 있으면 그 전날
$$;
REVOKE ALL ON FUNCTION private.probation_max_end(date) FROM PUBLIC, anon, authenticated;

-- 수습 직원 비율이 비면 매장 기본값으로 채우고, 수습 마지막 날이 3개월 범위를 넘으면 막는다.
CREATE OR REPLACE FUNCTION private.prepare_employee_probation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_start date;
BEGIN
  IF NEW.probation_ends_on IS NOT NULL THEN
    v_start := coalesce(NEW.probation_started_at::date, NEW.joined_at);
    IF v_start IS NOT NULL AND (NEW.probation_ends_on < v_start OR NEW.probation_ends_on > private.probation_max_end(v_start)) THEN
      RAISE EXCEPTION 'PROBATION_END_OUT_OF_RANGE' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NEW.is_probation AND NEW.probation_rate IS NULL THEN
    SELECT s.default_probation_rate INTO NEW.probation_rate FROM public.stores s WHERE s.id = NEW.store_id;
    NEW.probation_rate := coalesce(NEW.probation_rate, 0.9);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.prepare_employee_probation() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS employees_prepare_probation ON public.employees;
CREATE TRIGGER employees_prepare_probation BEFORE INSERT OR UPDATE OF is_probation, probation_rate, store_id,
  probation_ends_on, probation_started_at, joined_at ON public.employees
  FOR EACH ROW EXECUTE FUNCTION private.prepare_employee_probation();

-- 파트타이머 일별 근무: × 0.9 → × 직원 비율(20261127124000과 같은 조건·순서, 트리거 이름 유지).
CREATE OR REPLACE FUNCTION private.apply_part_time_probation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE e public.employees%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.applied_hourly_wage IS NOT DISTINCT FROM OLD.applied_hourly_wage THEN RETURN NEW; END IF;
  -- INSERT … ON CONFLICT DO UPDATE: 같은 날 행이 이미 있으면 기존 행의 적용 시급(이미 반영된 값)을 쓰므로 다시 곱하지 않는다.
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.payroll_daily_work d WHERE d.employee_id = NEW.employee_id AND d.work_date = NEW.work_date) THEN
    RETURN NEW;
  END IF;
  SELECT * INTO e FROM public.employees WHERE id = NEW.employee_id;
  IF e.id IS NOT NULL AND e.is_probation AND e.probation_ends_on IS NOT NULL
    AND coalesce(e.probation_started_at::date, e.joined_at) IS NOT NULL
    AND NEW.work_date BETWEEN coalesce(e.probation_started_at::date, e.joined_at) AND e.probation_ends_on THEN
    NEW.applied_hourly_wage := round(NEW.applied_hourly_wage * coalesce(e.probation_rate, 0.9), 4);
    NEW.gross := round(NEW.worked_minutes * NEW.applied_hourly_wage / 60);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.apply_part_time_probation() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION private.apply_part_time_probation() IS '파트타이머 수습 기간 근무일의 적용 시급 × 직원 수습 비율(새 시급이 정해질 때만, 2026-v2)';

-- 이미 적용된 두 읽기 함수는 정의에서 해당 조각만 바꿔 다시 만든다(시그니처·권한·search_path 그대로).
DO $swap$
DECLARE def text; old_part text; new_part text;
BEGIN
  def := pg_get_functiondef('public.get_financial_summaries_v2(uuid[],text[],boolean)'::regprocedure);
  old_part := '-0.1*CASE WHEN e.is_probation';
  new_part := '-(1-coalesce(e.probation_rate,0.9))*CASE WHEN e.is_probation';
  IF (length(def) - length(replace(def, old_part, ''))) / length(old_part) <> 1 THEN RAISE EXCEPTION 'PROBATION_RATE_BASE_CHANGED'; END IF;
  EXECUTE replace(def, old_part, new_part);

  def := pg_get_functiondef('public.get_daily_labor_sources(uuid,text)'::regprocedure);
  old_part := '''probation_ends_on'',e.probation_ends_on)';
  new_part := '''probation_ends_on'',e.probation_ends_on,''probation_rate'',e.probation_rate)';
  IF (length(def) - length(replace(def, old_part, ''))) / length(old_part) <> 1 THEN RAISE EXCEPTION 'PROBATION_RATE_BASE_CHANGED'; END IF;
  EXECUTE replace(def, old_part, new_part);
END $swap$;

-- 기존 수습 직원은 90%로 채운다(마지막에 둬서 DDL 뒤 지연 제약 검사와 겹치지 않게 한다).
UPDATE public.employees SET probation_rate = 0.9 WHERE is_probation AND probation_rate IS NULL;

COMMENT ON COLUMN public.stores.default_probation_rate IS '매장 수습 기본 지급 비율(0~1, 기본 0.9). 직원 비율이 비면 저장 시점에 채운다';
COMMENT ON COLUMN public.employees.probation_rate IS '직원 수습 지급 비율(0~1). 수습 직원은 비어 있으면 매장 기본값으로 채워진다';

NOTIFY pgrst, 'reload schema';
COMMIT;
