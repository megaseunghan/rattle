-- 목적: 직원 합류 신청에 계약(근로자/프리랜서 3.3%/잘 모르겠어요)·주 근무시간(분)·주휴 포함 여부를 받고,
--   최종 합류(approve_join_onboarding)에서 관리자가 정한 계약·수습(적용 여부·마지막 날·비율)을
--   승인과 같은 트랜잭션에서 직원에 반영한다(시안 join-v9, 사용자 확정 2026-11-27).
-- 정책 문서: docs/intent/급여-계산-바로잡기.md 「일용근로자 등록·지급 상태 기록」「수습 기간 = 시작일부터 3개월」,
--   ui-review-standard docs/intent/매장-만들기-마저-채우기.md 「직원 합류」, DESIGN.md 「매장 만들기·마저 채우기·직원 합류 시안 확정」.
-- 선행 파일: 20261022_employee_join_onboarding(validate_join_profile·store_join_profiles), 20261118160000(approve_join_onboarding),
--   20261127120000(employees.income_type·weekly_minutes·weekly_rest_included), 20261127130000(probation_rate·수습 트리거).
-- 호환:
--   - 새 키가 없는 이전 앱의 신청·승인은 지금과 똑같이 동작한다(새 키는 입력에 있을 때만 결과에 담는다).
--   - 계약 'unknown'은 신청에서만 받는다. 최종 합류 리뷰에 'unknown'이 남아 있으면 JOIN_INCOME_TYPE_REQUIRED로 막는다.
--   - weekly_minutes가 오면 weekly_hours는 분 ÷ 60 버림으로 채운다(기존 정수 열·CHECK 유지).
--   - 수습 키(is_probation)가 리뷰에 있을 때만 직원 수습을 바꾼다. 범위 검사·비율 채우기는 기존 트리거(prepare_employee_probation).
--   - 재합류 '기존 조건 유지'(preserve) 경로는 바꾸지 않는다.
--   - 재입사(rehire)에 수습 키가 있으면 예전 수습 마지막 날을 먼저 비운다(입사일 변경 시 범위 검사에 막히지 않게).
--   - 새 앱은 최종 합류 리뷰에 income_type을 항상 보낸다(신청 'unknown'을 관리자가 정했는지 서버가 확인).
-- 가드: 원격 적용본 본문 md5(2026-11-28 조회)와 같을 때만 바꾼다. 다르면 중단한다(JOIN_INCOME_BASE_CHANGED).
--   approve_join_onboarding·submit_join_onboarding_invite는 정의에서 정확히 한 번씩 나오는 조각만 바꾼다(시그니처·권한·search_path 그대로).
-- 기존 자료: store_join_profiles 새 열은 null로 시작한다. 직원·급여 이력·월 명세는 바꾸지 않는다.
-- 재실행: 열 IF NOT EXISTS, 제약 이름 확인. 함수 교체 후 다시 실행하면 md5 가드에서 멈춘다(의도한 동작).
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $guard$ BEGIN
  IF md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.validate_join_profile(jsonb)'::regprocedure)) <> '841a3b896586ae6b144bea1705d1961a'
    OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.approve_join_onboarding(uuid,integer,jsonb,text,uuid)'::regprocedure)) <> '9b68e7b80b76e21ed08bf9e66ec9e011'
    OR md5((SELECT prosrc FROM pg_proc WHERE oid = 'public.submit_join_onboarding_invite(uuid,text,text,jsonb)'::regprocedure)) <> '4f339fdda5e5902192d08f7b3550669e' THEN
    RAISE EXCEPTION 'JOIN_INCOME_BASE_CHANGED';
  END IF;
END $guard$;

ALTER TABLE public.store_join_profiles
  ADD COLUMN IF NOT EXISTS income_type text,
  ADD COLUMN IF NOT EXISTS weekly_minutes integer,
  ADD COLUMN IF NOT EXISTS weekly_rest_included boolean;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_join_profiles_income_type_check') THEN
    ALTER TABLE public.store_join_profiles ADD CONSTRAINT store_join_profiles_income_type_check
      CHECK (income_type IS NULL OR income_type IN ('employee', 'freelancer', 'unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_join_profiles_weekly_minutes_check') THEN
    ALTER TABLE public.store_join_profiles ADD CONSTRAINT store_join_profiles_weekly_minutes_check
      CHECK (weekly_minutes IS NULL OR (weekly_minutes BETWEEN 0 AND 10080 AND weekly_minutes % 10 = 0));
  END IF;
END $$;

-- 신청·리뷰 공통 검사. 기존 검사를 그대로 두고 새 키 세 개를 더한다. 새 키는 입력에 있을 때만 결과에 담는다.
CREATE OR REPLACE FUNCTION public.validate_join_profile(p_profile jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE p public.store_join_profiles%ROWTYPE; hours numeric; mins numeric; extra jsonb := '{}'::jsonb;
BEGIN
  IF p_profile IS NULL OR jsonb_typeof(p_profile)<>'object' THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
  p.employment_type:=p_profile->>'employment_type';
  p.hourly_wage:=(p_profile->>'hourly_wage')::numeric;
  hours:=(p_profile->>'weekly_hours')::numeric;
  mins:=(p_profile->>'weekly_minutes')::numeric;
  IF mins IS NOT NULL THEN
    IF p.employment_type<>'part_time' OR mins<>trunc(mins) OR mins NOT BETWEEN 0 AND 10080 OR mins % 10<>0 THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
    hours:=trunc(mins/60);
    extra:=extra||jsonb_build_object('weekly_minutes',mins::integer);
  END IF;
  IF hours IS NOT NULL AND (hours<>trunc(hours) OR hours NOT BETWEEN 0 AND 168) THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
  p.weekly_hours:=hours::integer;
  p.base_salary:=(p_profile->>'base_salary')::numeric;
  p.non_taxable:=(p_profile->>'non_taxable')::numeric;
  IF (p_profile->>'joined_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
  p.joined_at:=(p_profile->>'joined_at')::date;
  p.bank_name:=trim(p_profile->>'bank_name');
  p.account_number:=regexp_replace(p_profile->>'account_number','[- ]','','g');
  IF NOT coalesce((p.employment_type='part_time' AND p.hourly_wage BETWEEN 1 AND 10000000 AND p.hourly_wage=trunc(p.hourly_wage)
      AND p.weekly_hours BETWEEN 0 AND 168 AND p.base_salary=0 AND p.non_taxable=0) OR
    (p.employment_type='regular' AND p.hourly_wage IS NULL AND p.weekly_hours IS NULL AND p.base_salary BETWEEN 1 AND 1000000000
      AND p.base_salary=trunc(p.base_salary) AND p.non_taxable BETWEEN 0 AND p.base_salary AND p.non_taxable=trunc(p.non_taxable)),false)
    OR NOT coalesce(p.joined_at BETWEEN DATE '1900-01-01' AND DATE '2100-12-31',false)
    OR NOT coalesce(length(p.bank_name) BETWEEN 1 AND 50,false) OR NOT coalesce(p.account_number ~ '^[0-9]{6,30}$',false)
  THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
  -- JSON null은 키 없음과 같다(이전 앱과 같은 결과).
  IF coalesce(jsonb_typeof(p_profile->'income_type'),'null')<>'null' THEN
    IF jsonb_typeof(p_profile->'income_type')<>'string' OR (p_profile->>'income_type') NOT IN ('employee','freelancer','unknown') THEN
      RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
    extra:=extra||jsonb_build_object('income_type',p_profile->>'income_type');
  END IF;
  IF p_profile ? 'weekly_rest_included' THEN
    IF jsonb_typeof(p_profile->'weekly_rest_included') NOT IN ('boolean','null')
      OR (p.employment_type<>'part_time' AND jsonb_typeof(p_profile->'weekly_rest_included')<>'null') THEN
      RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
    extra:=extra||jsonb_build_object('weekly_rest_included',p_profile->'weekly_rest_included');
  END IF;
  RETURN jsonb_build_object('employment_type',p.employment_type,'hourly_wage',p.hourly_wage,'weekly_hours',p.weekly_hours,
    'base_salary',p.base_salary,'non_taxable',p.non_taxable,'joined_at',p.joined_at,'bank_name',p.bank_name,'account_number',p.account_number)||extra;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID';
END;
$function$;

-- 최종 합류 리뷰의 수습 키 검사. 키가 없으면 빈 객체(수습을 바꾸지 않음).
CREATE OR REPLACE FUNCTION private.validate_join_probation(p_review jsonb, p_joined_at date) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE v_end date; v_rate numeric;
BEGIN
  IF NOT (p_review ? 'is_probation') THEN RETURN '{}'::jsonb; END IF;
  IF jsonb_typeof(p_review->'is_probation')<>'boolean' THEN RAISE EXCEPTION 'JOIN_PROBATION_INVALID'; END IF;
  IF NOT (p_review->>'is_probation')::boolean THEN
    RETURN jsonb_build_object('is_probation',false,'probation_ends_on',NULL,'probation_rate',NULL);
  END IF;
  BEGIN
    IF (p_review->>'probation_ends_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'bad date'; END IF;
    v_end := (p_review->>'probation_ends_on')::date;
    IF p_review ? 'probation_rate' AND jsonb_typeof(p_review->'probation_rate') NOT IN ('number','null') THEN RAISE EXCEPTION 'bad rate'; END IF;
    v_rate := (p_review->>'probation_rate')::numeric;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'JOIN_PROBATION_INVALID';
  END;
  IF v_end IS NULL OR (v_rate IS NOT NULL AND (v_rate <= 0 OR v_rate > 1)) THEN RAISE EXCEPTION 'JOIN_PROBATION_INVALID'; END IF;
  -- 입사일 ~ 입사일부터 3개월의 마지막 날. 직원 트리거도 같은 범위를 검사한다.
  IF p_joined_at IS NOT NULL AND (v_end < p_joined_at OR v_end > private.probation_max_end(p_joined_at)) THEN
    RAISE EXCEPTION 'PROBATION_END_OUT_OF_RANGE' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('is_probation',true,'probation_ends_on',v_end,'probation_rate',v_rate);
END $$;
REVOKE ALL ON FUNCTION private.validate_join_probation(jsonb, date) FROM PUBLIC, anon, authenticated;

-- 최종 합류 직후 같은 트랜잭션에서 리뷰의 계약·주 근무시간·주휴·수습을 직원에 반영한다.
-- approve_join_onboarding(SECURITY DEFINER) 안에서만 부른다. 리뷰에 없는 키는 그대로 둔다.
CREATE OR REPLACE FUNCTION private.apply_join_review_extras(p_employee_id uuid, p_store_id uuid, p_reviewed jsonb) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF p_employee_id IS NULL OR p_store_id IS NULL THEN RAISE EXCEPTION 'JOIN_REVIEW_CHANGED'; END IF;
  IF p_reviewed->>'income_type' = 'unknown' THEN RAISE EXCEPTION 'JOIN_INCOME_TYPE_REQUIRED' USING ERRCODE = '22023'; END IF;
  UPDATE public.employees e SET
    income_type = CASE WHEN p_reviewed ? 'income_type' THEN p_reviewed->>'income_type' ELSE e.income_type END,
    weekly_minutes = CASE WHEN p_reviewed ? 'weekly_minutes' THEN (p_reviewed->>'weekly_minutes')::integer ELSE e.weekly_minutes END,
    weekly_rest_included = CASE WHEN p_reviewed ? 'weekly_rest_included' THEN (p_reviewed->>'weekly_rest_included')::boolean ELSE e.weekly_rest_included END,
    is_probation = CASE WHEN p_reviewed ? 'is_probation' THEN (p_reviewed->>'is_probation')::boolean ELSE e.is_probation END,
    probation_started_at = CASE WHEN p_reviewed ? 'is_probation' THEN NULL ELSE e.probation_started_at END,
    probation_ends_on = CASE WHEN p_reviewed ? 'is_probation' THEN (p_reviewed->>'probation_ends_on')::date ELSE e.probation_ends_on END,
    probation_rate = CASE WHEN p_reviewed ? 'is_probation' THEN (p_reviewed->>'probation_rate')::numeric ELSE e.probation_rate END
  WHERE e.id = p_employee_id AND e.store_id = p_store_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'JOIN_REVIEW_CHANGED'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.apply_join_review_extras(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- 이미 적용된 두 함수는 정의에서 정확히 한 번 나오는 조각만 바꿔 다시 만든다.
DO $swap$
DECLARE def text; frag text;
BEGIN
  -- 1) 최종 합류: 리뷰에 수습 키를 더해 기록하고, 직원 반영 후 결과를 돌려준다. 프로필 없는 승인 행에도 새 열을 넣는다.
  def := pg_get_functiondef('public.approve_join_onboarding(uuid,integer,jsonb,text,uuid)'::regprocedure);
  FOREACH frag IN ARRAY ARRAY[
    'reviewed:=public.validate_join_profile(p_review);',
    '    p:=jsonb_populate_record(p,reviewed);',
    'non_taxable,joined_at,bank_name,account_number)',
    'p.non_taxable,p.joined_at,p.bank_name,p.account_number);',
    '  RETURN QUERY SELECT result.employee_id::uuid,result.employee_name::text;'] LOOP
    IF (length(def) - length(replace(def, frag, ''))) / length(frag) <> 1 THEN RAISE EXCEPTION 'JOIN_INCOME_BASE_CHANGED'; END IF;
  END LOOP;
  def := replace(def, 'reviewed:=public.validate_join_profile(p_review);',
    'reviewed:=public.validate_join_profile(p_review);' || E'\n' ||
    '  reviewed:=reviewed||private.validate_join_probation(p_review,(reviewed->>''joined_at'')::date);');
  -- 재입사: 아래 첫 직원 UPDATE가 입사일을 바꾸면 수습 트리거가 예전 수습 마지막 날을 범위 밖으로 막는다.
  -- 리뷰에 수습 키가 있으면(새 앱) 예전 마지막 날을 먼저 비우고, 새 수습은 apply_join_review_extras가 넣는다.
  def := replace(def, '    p:=jsonb_populate_record(p,reviewed);',
    '    p:=jsonb_populate_record(p,reviewed);' || E'\n' ||
    '    IF reviewed ? ''is_probation'' THEN UPDATE public.employees SET probation_ends_on=NULL WHERE id=result.employee_id AND store_id=m.store_id AND probation_ends_on IS NOT NULL; END IF;');
  def := replace(def, 'non_taxable,joined_at,bank_name,account_number)',
    'non_taxable,joined_at,bank_name,account_number,income_type,weekly_minutes,weekly_rest_included)');
  def := replace(def, 'p.non_taxable,p.joined_at,p.bank_name,p.account_number);',
    'p.non_taxable,p.joined_at,p.bank_name,p.account_number,p.income_type,p.weekly_minutes,p.weekly_rest_included);');
  def := replace(def, '  RETURN QUERY SELECT result.employee_id::uuid,result.employee_name::text;',
    '  PERFORM private.apply_join_review_extras(result.employee_id::uuid,m.store_id,reviewed);' || E'\n' ||
    '  RETURN QUERY SELECT result.employee_id::uuid,result.employee_name::text;');
  EXECUTE def;

  -- 2) 합류 신청: 새 열을 저장하고, 다시 제출하면 새 값으로 바꾼다.
  def := pg_get_functiondef('public.submit_join_onboarding_invite(uuid,text,text,jsonb)'::regprocedure);
  FOREACH frag IN ARRAY ARRAY[
    'non_taxable,joined_at,bank_name,account_number)',
    'profile.joined_at,profile.bank_name,profile.account_number)',
    'account_number=excluded.account_number,'] LOOP
    IF (length(def) - length(replace(def, frag, ''))) / length(frag) <> 1 THEN RAISE EXCEPTION 'JOIN_INCOME_BASE_CHANGED'; END IF;
  END LOOP;
  def := replace(def, 'non_taxable,joined_at,bank_name,account_number)',
    'non_taxable,joined_at,bank_name,account_number,income_type,weekly_minutes,weekly_rest_included)');
  def := replace(def, 'profile.joined_at,profile.bank_name,profile.account_number)',
    'profile.joined_at,profile.bank_name,profile.account_number,profile.income_type,profile.weekly_minutes,profile.weekly_rest_included)');
  def := replace(def, 'account_number=excluded.account_number,',
    'account_number=excluded.account_number,income_type=excluded.income_type,weekly_minutes=excluded.weekly_minutes,weekly_rest_included=excluded.weekly_rest_included,');
  EXECUTE def;
END $swap$;

COMMENT ON COLUMN public.store_join_profiles.income_type IS '신청한 계약: employee(근로자) / freelancer(3.3%) / unknown(잘 모르겠어요, 최종 합류 때 관리자가 정함). null = 이전 앱';
COMMENT ON COLUMN public.store_join_profiles.weekly_minutes IS '신청한 주 근무시간(분, 10분 단위, 파트타이머)';
COMMENT ON COLUMN public.store_join_profiles.weekly_rest_included IS '시급에 주휴수당 포함(파트타이머). null = 잘 모르겠어요';
COMMENT ON FUNCTION private.apply_join_review_extras(uuid, uuid, jsonb) IS '최종 합류 리뷰의 계약·주 근무시간·주휴·수습을 같은 트랜잭션에서 직원에 반영(2026-11-28)';

NOTIFY pgrst, 'reload schema';
COMMIT;
