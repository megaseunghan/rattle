-- 목적: 매장 만들기(s02-v16)와 마저 채우기(fill-v5) 저장(사용자 확정 2026-11-27, 적용 승인 2026-11-28).
--   1) stores에 마저 채우기 칸을 더한다: 급여 마감일·지급일(같은 달/다음 달)·지급일이 쉬는 날일 때 처리,
--      상시 근로자 5인 여부, 사업자 유형·과세 유형, 4대보험 가입 여부, 24시간 영업 여부.
--      날짜 0 = 말일. 30·31일은 없는 달이 있어 받지 않는다(1~29일 + 말일).
--   2) 마저 채우기 칸은 사장님만 바꾼다(점장은 보기만): BEFORE UPDATE 트리거 STORE_FILL_OWNER_REQUIRED.
--      산재 업종(industrial_accident_industry)도 마저 채우기 칸이라 가드한다.
--      사업자번호(business_number)는 기존 매장 정보 화면(관리자 수정)과 겹쳐 이 가드에 넣지 않는다.
--      auth.uid()가 없는 세션(SQL 편집기·service_role)도 막힌다(기존 guard_store_sharing_owner와 같은 방식).
--   3) create_store_with_setup_v2: 이름·손익 공유·주소·마감 시간(24시간이면 하루 매출 나누는 시각)·수습 기간·수습 비율을
--      한 번에 저장한다. POS 연결은 매장 설정에서 시작하므로 pos_setup_choice='later'로 고정한다.
--      같은 계정+requestId는 v1과 같은 advisory lock으로 직렬화하고, 이미 있으면 처음 만든 매장을 돌려준다.
-- 정책 문서: ui-review-standard docs/intent/매장-만들기-마저-채우기.md 「매장 만들기 흐름」「마저 채우기」.
-- 선행 파일: 20261023123000(create_store_with_setup v1), 20261127130000(default_probation_rate·months 검사).
-- 호환: v1 함수는 이전 앱을 위해 그대로 둔다. 기존 매장 12개의 값은 바꾸지 않는다(새 칸은 null = 아직 안 정함, is_open_24h=false).
-- 재실행: 열 IF NOT EXISTS, 제약 이름 확인, 함수 CREATE OR REPLACE, 트리거 DROP IF EXISTS 후 생성.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS is_open_24h boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payroll_close_day smallint,
  ADD COLUMN IF NOT EXISTS payday_month_offset smallint,
  ADD COLUMN IF NOT EXISTS payday_day smallint,
  ADD COLUMN IF NOT EXISTS payday_holiday_rule text,
  ADD COLUMN IF NOT EXISTS headcount_class text,
  ADD COLUMN IF NOT EXISTS business_entity_type text,
  ADD COLUMN IF NOT EXISTS vat_type text,
  ADD COLUMN IF NOT EXISTS social_insurance_enrolled boolean;

DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
    ('stores_payroll_close_day_check', 'payroll_close_day IS NULL OR payroll_close_day BETWEEN 0 AND 29'),
    ('stores_payday_month_offset_check', 'payday_month_offset IS NULL OR payday_month_offset IN (0, 1)'),
    ('stores_payday_day_check', 'payday_day IS NULL OR payday_day BETWEEN 0 AND 29'),
    ('stores_payday_holiday_rule_check', 'payday_holiday_rule IS NULL OR payday_holiday_rule IN (''before'', ''same'', ''after'')'),
    ('stores_headcount_class_check', 'headcount_class IS NULL OR headcount_class IN (''five_or_more'', ''under_five'', ''unknown'')'),
    ('stores_business_entity_type_check', 'business_entity_type IS NULL OR business_entity_type IN (''individual'', ''corporation'')'),
    ('stores_vat_type_check', 'vat_type IS NULL OR vat_type IN (''general'', ''simplified'')')
  ) AS t(name, expr) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = c.name) THEN
      EXECUTE format('ALTER TABLE public.stores ADD CONSTRAINT %I CHECK (%s)', c.name, c.expr);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.guard_store_fill_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF (NEW.payroll_close_day IS DISTINCT FROM OLD.payroll_close_day
      OR NEW.payday_month_offset IS DISTINCT FROM OLD.payday_month_offset
      OR NEW.payday_day IS DISTINCT FROM OLD.payday_day
      OR NEW.payday_holiday_rule IS DISTINCT FROM OLD.payday_holiday_rule
      OR NEW.headcount_class IS DISTINCT FROM OLD.headcount_class
      OR NEW.business_entity_type IS DISTINCT FROM OLD.business_entity_type
      OR NEW.vat_type IS DISTINCT FROM OLD.vat_type
      OR NEW.social_insurance_enrolled IS DISTINCT FROM OLD.social_insurance_enrolled
      OR NEW.industrial_accident_industry IS DISTINCT FROM OLD.industrial_accident_industry)
    AND (SELECT auth.uid()) IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'STORE_FILL_OWNER_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.guard_store_fill_owner() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_store_fill_owner ON public.stores;
CREATE TRIGGER guard_store_fill_owner BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION private.guard_store_fill_owner();

CREATE OR REPLACE FUNCTION public.create_store_with_setup_v2(
  p_name text, p_share_scope text, p_request_id uuid, p_address text, p_closing_time time,
  p_is_open_24h boolean, p_probation_months smallint, p_probation_rate numeric) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE result public.stores; v_address text := nullif(btrim(coalesce(p_address, '')), '');
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 80 OR p_request_id IS NULL
    OR p_share_scope IS NULL OR p_share_scope NOT IN ('none', 'regular_only', 'all_staff')
    OR (v_address IS NOT NULL AND length(v_address) > 200)
    OR p_closing_time IS NULL OR date_trunc('hour', p_closing_time::interval) <> p_closing_time::interval
    OR p_is_open_24h IS NULL
    OR (p_probation_months IS NOT NULL AND p_probation_months NOT IN (1, 2, 3))
    OR (p_probation_rate IS NOT NULL AND (p_probation_rate <= 0 OR p_probation_rate > 1)) THEN
    RAISE EXCEPTION 'INVALID_STORE_SETUP' USING ERRCODE = '22023';
  END IF;
  -- v1과 같은 잠금 키: 같은 계정+요청의 재시도(성공 응답 유실 포함)를 직렬화한다.
  PERFORM pg_advisory_xact_lock(hashtextextended((SELECT auth.uid())::text || p_request_id::text, 0));
  SELECT * INTO result FROM public.stores WHERE owner_id = (SELECT auth.uid()) AND setup_request_id = p_request_id;
  IF FOUND THEN RETURN to_jsonb(result); END IF;
  INSERT INTO public.stores(name, owner_id, financial_share_scope, pos_setup_choice, setup_request_id,
    address, closing_time, is_open_24h, default_probation_months, default_probation_rate)
  VALUES (btrim(p_name), (SELECT auth.uid()), p_share_scope, 'later', p_request_id,
    v_address, p_closing_time, p_is_open_24h, p_probation_months,
    CASE WHEN p_probation_months IS NULL OR p_probation_rate IS NULL THEN 0.9 ELSE p_probation_rate END)
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.create_store_with_setup_v2(text, text, uuid, text, time, boolean, smallint, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_store_with_setup_v2(text, text, uuid, text, time, boolean, smallint, numeric) TO authenticated;

COMMENT ON COLUMN public.stores.is_open_24h IS '24시간 영업. true면 closing_time은 하루 매출을 나누는 시각';
COMMENT ON COLUMN public.stores.payroll_close_day IS '급여 마감일(1~29, 0=말일). null = 아직 안 정함';
COMMENT ON COLUMN public.stores.payday_month_offset IS '지급일이 마감 달 기준 같은 달(0)·다음 달(1)';
COMMENT ON COLUMN public.stores.payday_day IS '급여 지급일(1~29, 0=말일)';
COMMENT ON COLUMN public.stores.payday_holiday_rule IS '지급일이 쉬는 날이면 before(앞당김)/same(그대로)/after(미룸)';
COMMENT ON COLUMN public.stores.headcount_class IS '상시 근로자 5인 여부(사장님이 고름): five_or_more/under_five/unknown';
COMMENT ON COLUMN public.stores.business_entity_type IS '사업자 유형: individual(개인)/corporation(법인)';
COMMENT ON COLUMN public.stores.vat_type IS '과세 유형: general(일반)/simplified(간이)';
COMMENT ON COLUMN public.stores.social_insurance_enrolled IS '4대보험 가입 사업장 여부. null = 아직 안 정함';
COMMENT ON FUNCTION public.create_store_with_setup_v2(text, text, uuid, text, time, boolean, smallint, numeric) IS '매장 만들기(s02-v16): POS는 나중에(later), 주소·마감 시간·수습 기간·비율을 한 번에 저장';

NOTIFY pgrst, 'reload schema';
COMMIT;
