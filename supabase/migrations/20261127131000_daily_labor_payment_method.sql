-- 목적: 일용근로자 지급 기록을 '지급 상태 기록'으로 맞춘다(사용자 결정 2026-11-27, A 세션 전달).
--   앱은 돈을 보내지 않는다. 근무 기록은 '지급 대기'로 쌓이고, 골라서 '지급 완료로 바꾸기'를 하면
--   지급일·지급 방법(계좌이체/현금)·실제 공제(소득세·지방소득세·고용보험)를 적는다.
--   공제는 앱이 예상값을 채워 두고 사용자가 고칠 수 있다. 고친 값을 income_tax 등에 그대로 저장하고,
--   앱이 계산한 예상값은 estimated_* 열에 따로 남긴다(나중에 차이를 확인할 수 있게).
--   '지급 대기로 되돌리기'는 기존 cancel_daily_labor_payment를 그대로 쓴다(지급 행은 canceled_at으로 남는다).
-- 기존 자료: 원격 daily_labor_payments 0건(2026-11-27 조회). 기존 행이 있어도 지급 방법은 'transfer'로 채운다.
-- 정책 문서: docs/intent/급여-계산-바로잡기.md 「일용 지급 상태 기록」. 선행 파일: 20261127121000_daily_laborers.sql.
-- 재실행: 열 IF NOT EXISTS, 제약 이름 확인, 함수는 옛 시그니처 DROP IF EXISTS 후 새로 만든다.
BEGIN;

ALTER TABLE public.daily_labor_payments
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'transfer',
  ADD COLUMN IF NOT EXISTS estimated_income_tax integer,
  ADD COLUMN IF NOT EXISTS estimated_local_income_tax integer,
  ADD COLUMN IF NOT EXISTS estimated_employment_insurance integer;
ALTER TABLE public.daily_labor_payments ALTER COLUMN payment_method DROP DEFAULT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_labor_payments_method_check') THEN
    ALTER TABLE public.daily_labor_payments ADD CONSTRAINT daily_labor_payments_method_check
      CHECK (payment_method IN ('transfer', 'cash'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_labor_payments_estimate_check') THEN
    ALTER TABLE public.daily_labor_payments ADD CONSTRAINT daily_labor_payments_estimate_check
      CHECK (coalesce(estimated_income_tax, 0) >= 0 AND coalesce(estimated_local_income_tax, 0) >= 0
        AND coalesce(estimated_employment_insurance, 0) >= 0);
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.record_daily_labor_payment(uuid, uuid, uuid[], date, integer, integer, integer, text);
CREATE OR REPLACE FUNCTION public.record_daily_labor_payment(
  p_store_id uuid, p_laborer_id uuid, p_entry_ids uuid[], p_paid_on date, p_payment_method text,
  p_income_tax integer, p_local_income_tax integer, p_employment_insurance integer,
  p_estimated_income_tax integer, p_estimated_local_income_tax integer, p_estimated_employment_insurance integer,
  p_calculation_version text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_count integer; v_gross integer; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_store_admin(p_store_id), false) THEN
    RAISE EXCEPTION 'DAILY_LABOR_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_entry_ids IS NULL OR cardinality(p_entry_ids) = 0 OR p_paid_on IS NULL OR p_payment_method IS NULL
    OR p_payment_method NOT IN ('transfer', 'cash')
    OR p_income_tax IS NULL OR p_local_income_tax IS NULL OR p_employment_insurance IS NULL
    OR p_income_tax < 0 OR p_local_income_tax < 0 OR p_employment_insurance < 0
    OR coalesce(p_estimated_income_tax, 0) < 0 OR coalesce(p_estimated_local_income_tax, 0) < 0 OR coalesce(p_estimated_employment_insurance, 0) < 0
    OR nullif(btrim(p_calculation_version), '') IS NULL THEN
    RAISE EXCEPTION 'DAILY_LABOR_PAYMENT_INVALID' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.daily_labor_entries
    WHERE id = ANY(p_entry_ids) AND store_id = p_store_id AND laborer_id = p_laborer_id FOR UPDATE;
  SELECT count(*), coalesce(sum(gross), 0) INTO v_count, v_gross FROM public.daily_labor_entries
    WHERE id = ANY(p_entry_ids) AND store_id = p_store_id AND laborer_id = p_laborer_id AND payment_id IS NULL;
  IF v_count <> cardinality(p_entry_ids) THEN RAISE EXCEPTION 'DAILY_LABOR_PAYMENT_CHANGED' USING ERRCODE = '40001'; END IF;
  IF p_income_tax + p_local_income_tax + p_employment_insurance > v_gross THEN
    RAISE EXCEPTION 'DAILY_LABOR_PAYMENT_INVALID' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.daily_labor_payments(store_id, laborer_id, paid_on, payment_method, gross, income_tax, local_income_tax, employment_insurance,
      net_pay, estimated_income_tax, estimated_local_income_tax, estimated_employment_insurance, calculation_version, created_by)
    VALUES (p_store_id, p_laborer_id, p_paid_on, p_payment_method, v_gross, p_income_tax, p_local_income_tax, p_employment_insurance,
      v_gross - p_income_tax - p_local_income_tax - p_employment_insurance,
      p_estimated_income_tax, p_estimated_local_income_tax, p_estimated_employment_insurance, p_calculation_version, auth.uid())
    RETURNING id INTO v_id;
  PERFORM set_config('rattle.daily_labor_payment', 'on', true);
  UPDATE public.daily_labor_entries SET payment_id = v_id WHERE id = ANY(p_entry_ids);
  PERFORM set_config('rattle.daily_labor_payment', 'off', true);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.record_daily_labor_payment(uuid, uuid, uuid[], date, text, integer, integer, integer, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_daily_labor_payment(uuid, uuid, uuid[], date, text, integer, integer, integer, integer, integer, integer, text) TO authenticated;

COMMENT ON COLUMN public.daily_labor_payments.payment_method IS '지급 방법: transfer(계좌이체) / cash(현금). 앱은 송금하지 않고 기록만 한다';
COMMENT ON COLUMN public.daily_labor_payments.income_tax IS '실제 뗀 소득세(사용자가 고친 값 그대로). 앱 예상값은 estimated_income_tax';

NOTIFY pgrst, 'reload schema';
COMMIT;
