-- 목적: 일용근로자를 계정 없이 사장·점장이 입력·관리한다(야미옥 「파출부 급여」 구조 참고).
--   daily_laborers: 매장별 명단(이름·연락처·은행·계좌·평일/주말 기본 일당).
--   daily_labor_entries: 하루 한 건 근무 기록(근무일·일당·추가수당·메모, 하루치 산출세액·고용보험 예상값).
--   daily_labor_payments: 지급 묶음. 소득세 1,000원 미만 미징수는 지급금액 기준으로 판단하므로
--     (국세청 일용근로소득 안내) 여러 날을 한 번에 줄 때 묶음 합계로 소득세·지방소득세를 정한다.
-- 정책 문서: docs/intent/급여-계산-바로잡기.md 「계획 확인 중 추가 결정」(2026-11-27 사용자 확인).
-- 개인정보: 주민등록번호·외국인등록번호·비자는 저장하지 않는다(사용자 결정). 사장·점장(is_store_admin)만 읽고 쓴다.
--   일반 직원·파트타이머·대기 계정은 행을 볼 수 없다. 매장 소프트 삭제 후 정리는 매장 정리 작업과 같은 범위로 별도 추가한다.
-- 공제 값: 앱의 계산 엔진(lib/payroll/dailyWorker.ts)이 계산한 값을 calculation_version과 함께 저장하고,
--   서버는 음수·합계(묶음 gross = 기록 gross 합, net_pay = gross − 공제)만 검사한다. 금액 원본은 daily_wage·extra_pay다.
--   지급된 기록은 금액을 바꾸거나 지울 수 없다(지급 취소 후 수정). 지급 취소는 행을 지우지 않고 canceled_at을 남긴다.
-- 선행 파일: 20261117150000_role_model_core.sql(is_store_admin).
-- 재실행: CREATE TABLE IF NOT EXISTS, 제약은 이름 확인 후 추가, 정책·트리거는 DROP 후 생성.
BEGIN;

CREATE TABLE IF NOT EXISTS public.daily_laborers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 50),
  phone text CHECK (phone IS NULL OR length(phone) <= 20),
  bank_name text CHECK (bank_name IS NULL OR length(bank_name) <= 30),
  account_number text,  -- 20261127125000 트리거가 암호화 토큰으로 바꿔 저장한다(평문 보관 안 함)
  weekday_wage integer CHECK (weekday_wage IS NULL OR weekday_wage BETWEEN 0 AND 10000000),
  weekend_wage integer CHECK (weekend_wage IS NULL OR weekend_wage BETWEEN 0 AND 10000000),
  memo text CHECK (memo IS NULL OR length(memo) <= 500),
  is_active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_laborers_store_idx ON public.daily_laborers(store_id, is_active, name);

CREATE TABLE IF NOT EXISTS public.daily_labor_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  laborer_id uuid NOT NULL REFERENCES public.daily_laborers(id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  is_weekend boolean NOT NULL DEFAULT false,
  daily_wage integer NOT NULL CHECK (daily_wage BETWEEN 0 AND 10000000),
  extra_pay integer NOT NULL DEFAULT 0 CHECK (extra_pay BETWEEN 0 AND 10000000),
  gross integer GENERATED ALWAYS AS (daily_wage + extra_pay) STORED,
  -- 하루치 산출세액((일급 − 15만)×6% − 55%, 원 미만 버림). 미징수·10원 버림은 지급 묶음에서 정한다.
  day_income_tax integer NOT NULL DEFAULT 0 CHECK (day_income_tax >= 0),
  employment_insurance integer NOT NULL DEFAULT 0 CHECK (employment_insurance >= 0),
  calculation_version text NOT NULL,
  memo text CHECK (memo IS NULL OR length(memo) <= 500),
  payment_id uuid,
  revision integer NOT NULL DEFAULT 0,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_labor_entries_one_per_day UNIQUE (laborer_id, work_date)
);
CREATE INDEX IF NOT EXISTS daily_labor_entries_store_date_idx ON public.daily_labor_entries(store_id, work_date);
CREATE INDEX IF NOT EXISTS daily_labor_entries_payment_idx ON public.daily_labor_entries(payment_id) WHERE payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.daily_labor_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  laborer_id uuid NOT NULL REFERENCES public.daily_laborers(id) ON DELETE RESTRICT,
  paid_on date NOT NULL,
  gross integer NOT NULL CHECK (gross >= 0),
  income_tax integer NOT NULL CHECK (income_tax >= 0),
  local_income_tax integer NOT NULL CHECK (local_income_tax >= 0),
  employment_insurance integer NOT NULL CHECK (employment_insurance >= 0),
  net_pay integer NOT NULL CHECK (net_pay >= 0),
  calculation_version text NOT NULL,
  canceled_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_labor_payments_net_check CHECK (net_pay = gross - income_tax - local_income_tax - employment_insurance)
);
CREATE INDEX IF NOT EXISTS daily_labor_payments_store_idx ON public.daily_labor_payments(store_id, paid_on);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_labor_entries_payment_fk') THEN
    ALTER TABLE public.daily_labor_entries ADD CONSTRAINT daily_labor_entries_payment_fk
      FOREIGN KEY (payment_id) REFERENCES public.daily_labor_payments(id);  -- NO ACTION: 매장 삭제 연쇄는 문장 끝에 확인
  END IF;
END $$;

-- 근무 기록의 매장은 일용근로자의 매장과 같아야 한다. 수정마다 revision을 올린다.
-- payment_id는 지급 함수(record/cancel_daily_labor_payment)만 바꾼다. 지급된 기록은 금액 수정·삭제를 막는다.
CREATE OR REPLACE FUNCTION private.guard_daily_labor_entry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- 매장 삭제 연쇄(외래키 CASCADE, 트리거 깊이 > 1)는 막지 않는다.
    IF OLD.payment_id IS NOT NULL AND pg_trigger_depth() <= 1 THEN RAISE EXCEPTION 'DAILY_LABOR_PAID_LOCKED' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.daily_laborers l WHERE l.id = NEW.laborer_id AND l.store_id = NEW.store_id) THEN
    RAISE EXCEPTION 'DAILY_LABOR_STORE_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    -- 작성자·revision·지급 연결은 클라이언트가 정하지 않는다.
    NEW.created_by := auth.uid();
    NEW.revision := 0;
    NEW.payment_id := NULL;
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.laborer_id IS DISTINCT FROM OLD.laborer_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'DAILY_LABOR_IMMUTABLE_OWNER' USING ERRCODE = '23514';
  END IF;
  IF NEW.payment_id IS DISTINCT FROM OLD.payment_id AND coalesce(current_setting('rattle.daily_labor_payment', true), '') <> 'on' THEN
    RAISE EXCEPTION 'DAILY_LABOR_PAYMENT_VIA_RPC' USING ERRCODE = '42501';
  END IF;
  IF OLD.payment_id IS NOT NULL AND NEW.payment_id IS NOT DISTINCT FROM OLD.payment_id AND (
    NEW.daily_wage IS DISTINCT FROM OLD.daily_wage OR NEW.extra_pay IS DISTINCT FROM OLD.extra_pay
    OR NEW.work_date IS DISTINCT FROM OLD.work_date OR NEW.day_income_tax IS DISTINCT FROM OLD.day_income_tax
    OR NEW.employment_insurance IS DISTINCT FROM OLD.employment_insurance) THEN
    RAISE EXCEPTION 'DAILY_LABOR_PAID_LOCKED' USING ERRCODE = '23514';
  END IF;
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_daily_labor_entry() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.touch_daily_laborer() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.revision := 0;
    NEW.created_at := now();
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  IF NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'DAILY_LABOR_IMMUTABLE_OWNER' USING ERRCODE = '23514';
  END IF;
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.touch_daily_laborer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS daily_labor_entries_guard ON public.daily_labor_entries;
CREATE TRIGGER daily_labor_entries_guard BEFORE INSERT OR UPDATE OR DELETE ON public.daily_labor_entries
  FOR EACH ROW EXECUTE FUNCTION private.guard_daily_labor_entry();
DROP TRIGGER IF EXISTS daily_laborers_touch ON public.daily_laborers;
CREATE TRIGGER daily_laborers_touch BEFORE INSERT OR UPDATE ON public.daily_laborers
  FOR EACH ROW EXECUTE FUNCTION private.touch_daily_laborer();

ALTER TABLE public.daily_laborers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_labor_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_labor_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.daily_laborers, public.daily_labor_entries, public.daily_labor_payments FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_laborers, public.daily_labor_entries TO authenticated;
-- 지급 묶음은 함수로만 만들고 취소한다(읽기만 직접).
REVOKE ALL ON public.daily_labor_payments FROM authenticated;
GRANT SELECT ON public.daily_labor_payments TO authenticated;

DROP POLICY IF EXISTS daily_laborers_admin ON public.daily_laborers;
CREATE POLICY daily_laborers_admin ON public.daily_laborers FOR ALL TO authenticated
  USING ((select public.is_store_admin(store_id))) WITH CHECK ((select public.is_store_admin(store_id)));
DROP POLICY IF EXISTS daily_labor_entries_admin ON public.daily_labor_entries;
CREATE POLICY daily_labor_entries_admin ON public.daily_labor_entries FOR ALL TO authenticated
  USING ((select public.is_store_admin(store_id))) WITH CHECK ((select public.is_store_admin(store_id)));

DROP POLICY IF EXISTS daily_labor_payments_admin_read ON public.daily_labor_payments;
CREATE POLICY daily_labor_payments_admin_read ON public.daily_labor_payments FOR SELECT TO authenticated
  USING ((select public.is_store_admin(store_id)));

-- 지급 처리: 같은 일용근로자의 미지급 기록을 묶어 지급 행을 만들고 기록을 연결한다(원자 처리).
-- 지급 행은 클라이언트가 직접 쓰지 못하므로 SECURITY DEFINER로 두고, 함수 안에서 is_store_admin과
--   매장·일용근로자 일치·미지급 여부를 직접 확인한다.
CREATE OR REPLACE FUNCTION public.record_daily_labor_payment(
  p_store_id uuid, p_laborer_id uuid, p_entry_ids uuid[], p_paid_on date,
  p_income_tax integer, p_local_income_tax integer, p_employment_insurance integer, p_calculation_version text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_count integer; v_gross integer; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_store_admin(p_store_id), false) THEN
    RAISE EXCEPTION 'DAILY_LABOR_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF p_entry_ids IS NULL OR cardinality(p_entry_ids) = 0 OR p_paid_on IS NULL
    OR p_income_tax < 0 OR p_local_income_tax < 0 OR p_employment_insurance < 0 OR nullif(btrim(p_calculation_version), '') IS NULL THEN
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
  INSERT INTO public.daily_labor_payments(store_id, laborer_id, paid_on, gross, income_tax, local_income_tax, employment_insurance, net_pay, calculation_version, created_by)
    VALUES (p_store_id, p_laborer_id, p_paid_on, v_gross, p_income_tax, p_local_income_tax, p_employment_insurance,
      v_gross - p_income_tax - p_local_income_tax - p_employment_insurance, p_calculation_version, auth.uid())
    RETURNING id INTO v_id;
  PERFORM set_config('rattle.daily_labor_payment', 'on', true);
  UPDATE public.daily_labor_entries SET payment_id = v_id WHERE id = ANY(p_entry_ids);
  PERFORM set_config('rattle.daily_labor_payment', 'off', true);
  RETURN v_id;
END $$;

-- 지급 취소: 지급 행은 남기고(canceled_at) 기록 연결만 푼다.
CREATE OR REPLACE FUNCTION public.cancel_daily_labor_payment(p_store_id uuid, p_payment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_store_admin(p_store_id), false) THEN
    RAISE EXCEPTION 'DAILY_LABOR_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  UPDATE public.daily_labor_payments SET canceled_at = now()
    WHERE id = p_payment_id AND store_id = p_store_id AND canceled_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'DAILY_LABOR_PAYMENT_CHANGED' USING ERRCODE = '40001'; END IF;
  PERFORM set_config('rattle.daily_labor_payment', 'on', true);
  UPDATE public.daily_labor_entries SET payment_id = NULL WHERE payment_id = p_payment_id AND store_id = p_store_id;
  PERFORM set_config('rattle.daily_labor_payment', 'off', true);
END $$;
REVOKE ALL ON FUNCTION public.record_daily_labor_payment(uuid, uuid, uuid[], date, integer, integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_daily_labor_payment(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_daily_labor_payment(uuid, uuid, uuid[], date, integer, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_daily_labor_payment(uuid, uuid) TO authenticated;

COMMENT ON TABLE public.daily_labor_payments IS '일용근로자 지급 묶음. 소득세 소액부징수는 묶음 합계 기준. 취소는 canceled_at';
COMMENT ON TABLE public.daily_laborers IS '일용근로자 명단(계정 없음, 사장·점장 입력). 주민번호 등 고유식별정보는 저장하지 않는다';
COMMENT ON TABLE public.daily_labor_entries IS '일용근로자 하루 한 건 근무 기록. day_income_tax는 미징수 판단 전 하루치 산출세액';

COMMIT;
