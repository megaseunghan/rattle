-- 목적: 일용 지급일이 고른 근무일보다 빠르면 거절한다(사용자 결정 2026-11-28 "지급일이 근무일보다 빠르면 막는 것도 넣어줘").
--   이 앱에는 선불·가불 개념이 없어 근무일 전 지급일은 입력 실수로 본다. 지급일은 고른 기록의 마지막 근무일 이후(같은 날 포함)여야 한다.
--   앱(PaymentSheet·preparePayment)도 같은 기준으로 막고, 서버 거절은 고정 코드 DAILY_LABOR_PAID_BEFORE_WORK로 알린다.
-- 정책 문서: docs/intent/급여-계산-바로잡기.md 「리뷰 반영·서버 검사 보정 (2026-11-28)」.
-- 선행 파일: 20261128120000_store_fill_server_checks.sql(같은 함수의 오늘 이후 지급일 거절, 원격 적용본 md5 335b50dc…).
-- 가드: 함수 본문 md5가 원격 적용본과 같고, 넣을 자리 조각이 정의에 정확히 한 번 있을 때만 바꾼다. 아니면
--   DAILY_LABOR_PAID_AFTER_WORK_BASE_CHANGED로 중단한다. 시그니처·SECURITY DEFINER·search_path·권한은 그대로 둔다.
-- 기존 자료(2026-11-28 원격 조회): 일용 지급 기록 0건. 기존 기록은 바꾸지 않는다(새 지급에만 적용).
-- 재실행: 함수 교체 후 다시 실행하면 md5 가드에서 멈춘다(의도한 동작).
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $guard$ BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.record_daily_labor_payment(uuid,uuid,uuid[],date,text,integer,integer,integer,integer,integer,integer,text)'::regprocedure))
    <> '335b50dca8b3a6ba496d74d44fe63846' THEN
    RAISE EXCEPTION 'DAILY_LABOR_PAID_AFTER_WORK_BASE_CHANGED';
  END IF;
END $guard$;

-- 잠근 기록이 모두 지급 대기인지 확인한 다음, 공제 합계 검사 앞에 근무일 검사를 넣는다.
DO $swap$
DECLARE def text; frag constant text := '  IF p_income_tax + p_local_income_tax + p_employment_insurance > v_gross THEN';
BEGIN
  def := pg_get_functiondef('public.record_daily_labor_payment(uuid,uuid,uuid[],date,text,integer,integer,integer,integer,integer,integer,text)'::regprocedure);
  IF (length(def) - length(replace(def, frag, ''))) / length(frag) <> 1 THEN RAISE EXCEPTION 'DAILY_LABOR_PAID_AFTER_WORK_BASE_CHANGED'; END IF;
  def := replace(def, frag,
    '  IF EXISTS (SELECT 1 FROM public.daily_labor_entries WHERE id = ANY(p_entry_ids) AND work_date > p_paid_on) THEN' || chr(10) ||
    '    RAISE EXCEPTION ''DAILY_LABOR_PAID_BEFORE_WORK'' USING ERRCODE = ''22023'';' || chr(10) ||
    '  END IF;' || chr(10) || frag);
  EXECUTE def;
END $swap$;

COMMIT;
