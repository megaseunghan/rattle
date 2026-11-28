-- 목적: 마저 채우기·일용 지급에서 앱만 막던 값을 서버에서도 막고, 산재 업종 '목록에 없어요'를 저장할 수 있게 한다
--   (사용자 결정 2026-11-28: 업종은 B안 = 서버에 저장, 서버 검사는 보정 마이그레이션 하나로 한 번에 적용).
--   1) 산재 업종 '목록에 없어요'(code 'unlisted')를 업종 표에 더한다. 요율 행은 넣지 않으므로
--      손익 사업주 부담에서는 지금의 '업종 미선택'과 같이 산재보험을 넣지 않는다(read model·앱 계산 그대로).
--      저장되면 마저 채우기 '4대보험' 묶음이 채운 것으로 세져 홈 유도가 매일 다시 뜨지 않는다.
--   2) 같은 달 지급이면 지급일이 마감일보다 뒤여야 한다(앱 lib/utils/payday.ts isSameMonthPayAllowed와 같은 기준:
--      마감일이 말일(0)이면 같은 달 지급 불가, 지급일 말일(0)은 마감일보다 뒤로 본다).
--   3) 일용 지급 기록(record_daily_labor_payment)의 지급일은 오늘(한국 날짜) 이후로 적을 수 없다.
-- 정책 문서: docs/intent/급여-계산-바로잡기.md 「원격 적용 기록」 남은 결정, DESIGN.md 「매장 만들기·마저 채우기·직원 합류 시안 확정」.
-- 선행 파일: 20261127123000_industrial_accident_rates.sql(업종 표·FK), 20261127131000_daily_labor_payment_method.sql(지급 함수),
--   20261127133000_store_fill_and_setup_v2.sql(지급일 열·CHECK·사장님 가드).
-- 가드: 지급 함수 본문 md5가 원격 적용본(2026-11-28 조회)과 같을 때만 바꾸고, 바꿀 조각이 정의에 정확히 한 번 있어야 한다.
--   다르면 STORE_FILL_CHECKS_BASE_CHANGED로 중단한다. 시그니처·SECURITY DEFINER·search_path·권한은 그대로 둔다.
-- 기존 자료(2026-11-28 원격 조회): 지급일을 정한 매장 0곳, 일용 지급 기록 0건이라 새 제약에 걸리는 행이 없다.
--   매장·직원·급여 원본은 바꾸지 않는다.
-- 재실행: 업종 ON CONFLICT DO NOTHING, 제약 이름 확인. 함수 교체 후 다시 실행하면 md5 가드에서 멈춘다(의도한 동작).
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $guard$ BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.record_daily_labor_payment(uuid,uuid,uuid[],date,text,integer,integer,integer,integer,integer,integer,text)'::regprocedure))
    <> '494b128a590cbb711c029ed0e38bfc03' THEN
    RAISE EXCEPTION 'STORE_FILL_CHECKS_BASE_CHANGED';
  END IF;
END $guard$;

-- 1) 산재 업종 '목록에 없어요'. 요율 없음 = 산재보험 미포함.
INSERT INTO public.industrial_accident_industries(code, name, sort_order)
VALUES ('unlisted', '목록에 없어요', 999)
ON CONFLICT (code) DO NOTHING;

-- 2) 같은 달 지급이면 지급일이 마감일보다 뒤.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stores_payday_same_month_check' AND conrelid = 'public.stores'::regclass) THEN
    ALTER TABLE public.stores ADD CONSTRAINT stores_payday_same_month_check CHECK (
      payday_month_offset IS DISTINCT FROM 0
      OR (payroll_close_day <> 0 AND (payday_day = 0 OR payday_day > payroll_close_day)));
  END IF;
END $$;

-- 3) 일용 지급일은 오늘(한국 날짜) 이후 불가. 기존 입력 검사 조건에 한 줄을 더한다.
DO $swap$
DECLARE def text; frag constant text := 'OR nullif(btrim(p_calculation_version), '''') IS NULL THEN';
BEGIN
  def := pg_get_functiondef('public.record_daily_labor_payment(uuid,uuid,uuid[],date,text,integer,integer,integer,integer,integer,integer,text)'::regprocedure);
  IF (length(def) - length(replace(def, frag, ''))) / length(frag) <> 1 THEN RAISE EXCEPTION 'STORE_FILL_CHECKS_BASE_CHANGED'; END IF;
  def := replace(def, frag,
    'OR p_paid_on > (now() AT TIME ZONE ''Asia/Seoul'')::date' || chr(10) || '    ' || frag);
  EXECUTE def;
END $swap$;

COMMENT ON CONSTRAINT stores_payday_same_month_check ON public.stores IS '같은 달 지급이면 지급일이 마감일보다 뒤(0=말일). 앱 isSameMonthPayAllowed와 같은 기준';

COMMIT;
