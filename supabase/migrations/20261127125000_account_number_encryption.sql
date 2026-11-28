-- 목적: 직원·합류 신청·일용근로자 계좌번호를 암호화해 보관한다(사용자 결정 2026-11-27).
--   근거: 「개인정보의 안전성 확보조치 기준」(개인정보보호위원회고시 제2026-9호) 제7조② 계좌번호 암호화 저장.
-- 방식(기존 RPC를 고치지 않는 투명 암호화):
--   account_number 열에 평문이 들어오면 BEFORE 트리거가 'enc:v1:<끝 4자리>:<pgp_sym_encrypt base64>' 토큰으로 바꾼다.
--   토큰이면 그대로 둔다. 그래서 합류 승인(approve_join_onboarding)·직원 생성(create_employee_from_join)·
--   ON CONFLICT DO UPDATE처럼 값을 옮겨 적는 기존 경로도 토큰을 그대로 옮기거나 평문을 다시 암호화한다.
--   store_join_profiles.reviewed_profile(jsonb)의 account_number도 같은 토큰으로 바꾼다.
--   account_last4(생성 열)는 화면 표시용 끝 4자리다. 전체 번호는 public.reveal_account_number로만 받는다.
-- 키: Supabase Vault 비밀 'rattle_account_number_key'(32바이트 난수). 없으면 이 마이그레이션이 만든다.
--   키를 지우거나 바꾸면 기존 계좌번호를 복호화할 수 없다. 키 값은 출력·공유하지 않는다.
-- 열람 권한: 직원 = 사장·점장(is_store_admin) 또는 본인, 일용근로자 = 사장·점장, 합류 신청 = 사장·점장 또는 신청자.
-- 기존 자료: 세 표의 평문 계좌번호를 토큰으로 바꾼다(값 자체는 보존, 복호화하면 같은 번호).
--   형식이 맞지 않는 옛 값(숫자 6~30자리 아님)도 지우지 않고 원문 그대로 암호화한다. 새 입력·변경은 형식을 검사한다.
-- 정책 문서: docs/intent/급여-계산-바로잡기.md 「구현 상태」.
-- 선행 파일: 20261022_employee_join_onboarding.sql(store_join_profiles), 20261116120000_qr_attendance.sql(pgcrypto),
--   20261127121000_daily_laborers.sql(daily_laborers).
-- 재실행: 함수 CREATE OR REPLACE, 트리거 DROP 후 생성, 열 IF NOT EXISTS, 키는 없을 때만 생성, 백필은 평문 행만.
BEGIN;

-- pgcrypto는 20261116120000에서 extensions(없으면 public) 스키마에 설치됐다. 두 곳 모두 search_path에 둔다.
CREATE OR REPLACE FUNCTION private.ensure_account_number_key() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'rattle_account_number_key') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'base64'), 'rattle_account_number_key', 'Rattle 계좌번호 암호화 키(삭제·교체 금지)');
  END IF;
END $$;
REVOKE ALL ON FUNCTION private.ensure_account_number_key() FROM PUBLIC, anon, authenticated;
SELECT private.ensure_account_number_key();

CREATE OR REPLACE FUNCTION private.account_number_key() RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE k text;
BEGIN
  SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'rattle_account_number_key';
  IF nullif(btrim(k), '') IS NULL THEN RAISE EXCEPTION 'ACCOUNT_NUMBER_KEY_MISSING'; END IF;
  RETURN k;
END $$;

-- 평문 → 토큰. 이미 토큰이면 그대로, 비어 있으면 NULL.
-- p_strict=false(기존 값 그대로 다시 쓰는 백필)는 형식이 맞지 않는 옛 값도 지우지 않고 원문 그대로 암호화해 보존한다.
CREATE OR REPLACE FUNCTION private.protect_account_number(p_value text, p_strict boolean DEFAULT true) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
DECLARE digits text;
BEGIN
  IF p_value IS NULL OR btrim(p_value) = '' THEN RETURN NULL; END IF;
  IF p_value LIKE 'enc:v1:%' THEN RETURN p_value; END IF;
  digits := regexp_replace(p_value, '[^0-9]', '', 'g');
  IF digits !~ '^[0-9]{6,30}$' THEN
    IF p_strict THEN RAISE EXCEPTION 'ACCOUNT_NUMBER_INVALID' USING ERRCODE = '22023'; END IF;
    RETURN 'enc:v1:' || right(digits, 4) || ':' || replace(encode(pgp_sym_encrypt(btrim(p_value), private.account_number_key()), 'base64'), E'\n', '');
  END IF;
  RETURN 'enc:v1:' || right(digits, 4) || ':' || replace(encode(pgp_sym_encrypt(digits, private.account_number_key()), 'base64'), E'\n', '');
END $$;

CREATE OR REPLACE FUNCTION private.reveal_account_token(p_token text) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, extensions, pg_temp AS $$
BEGIN
  IF p_token IS NULL OR p_token NOT LIKE 'enc:v1:%' THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(decode(split_part(p_token, ':', 4), 'base64'), private.account_number_key());
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;  -- 손상·위조 토큰은 '확인 불가'로 둔다(원문·오류 내용을 돌려주지 않는다).
END $$;

CREATE OR REPLACE FUNCTION private.guard_account_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  -- 새 행이거나 값이 바뀐 경우만 형식을 검사한다(같은 값을 다시 쓰는 백필·다른 열 수정은 옛 값 보존).
  NEW.account_number := private.protect_account_number(NEW.account_number,
    TG_OP = 'INSERT' OR NEW.account_number IS DISTINCT FROM OLD.account_number);
  -- 다른 표에는 reviewed_profile 열이 없으므로 표 이름 검사와 열 접근을 한 식에 넣지 않는다.
  IF TG_TABLE_NAME = 'store_join_profiles' THEN
    IF NEW.reviewed_profile IS NOT NULL AND jsonb_typeof(NEW.reviewed_profile) = 'object'
      AND NEW.reviewed_profile ? 'account_number' AND jsonb_typeof(NEW.reviewed_profile->'account_number') = 'string' THEN
      NEW.reviewed_profile := jsonb_set(NEW.reviewed_profile, '{account_number}',
        to_jsonb(private.protect_account_number(NEW.reviewed_profile->>'account_number',
          TG_OP = 'INSERT' OR NEW.reviewed_profile IS DISTINCT FROM OLD.reviewed_profile)));
    END IF;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.account_number_key(), private.protect_account_number(text, boolean), private.reveal_account_token(text),
  private.guard_account_number() FROM PUBLIC, anon, authenticated;

-- store_join_profiles: 평문 숫자 검사(NOT NULL·^[0-9]{6,30}$)를 토큰 검사로 바꾼다. 입력 검사는 validate_join_profile이 계속 한다.
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'public.store_join_profiles'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%account_number%' AND conname <> 'store_join_profiles_account_token_check' LOOP
    EXECUTE format('ALTER TABLE public.store_join_profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS protect_account_number ON public.employees;
DROP TRIGGER IF EXISTS protect_account_number ON public.store_join_profiles;
DROP TRIGGER IF EXISTS protect_account_number ON public.daily_laborers;
CREATE TRIGGER protect_account_number BEFORE INSERT OR UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION private.guard_account_number();
CREATE TRIGGER protect_account_number BEFORE INSERT OR UPDATE ON public.store_join_profiles
  FOR EACH ROW EXECUTE FUNCTION private.guard_account_number();
CREATE TRIGGER protect_account_number BEFORE INSERT OR UPDATE ON public.daily_laborers
  FOR EACH ROW EXECUTE FUNCTION private.guard_account_number();

-- 기존 평문을 토큰으로(트리거가 바꾼다).
UPDATE public.employees SET account_number = account_number WHERE account_number IS NOT NULL AND account_number NOT LIKE 'enc:v1:%';
UPDATE public.store_join_profiles SET account_number = account_number
  WHERE (account_number IS NOT NULL AND account_number NOT LIKE 'enc:v1:%')
     OR (reviewed_profile ? 'account_number' AND reviewed_profile->>'account_number' NOT LIKE 'enc:v1:%');
UPDATE public.daily_laborers SET account_number = account_number WHERE account_number IS NOT NULL AND account_number NOT LIKE 'enc:v1:%';

-- 원격 employees에는 지연(DEFERRABLE) 제약 트리거가 있다. 백필 UPDATE 뒤 ALTER TABLE 전에 대기 중인 검사를 먼저 끝낸다
-- (안 하면 55006 'pending trigger events'로 실패).
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_join_profiles_account_token_check') THEN
    ALTER TABLE public.store_join_profiles ADD CONSTRAINT store_join_profiles_account_token_check
      CHECK (account_number IS NULL OR account_number LIKE 'enc:v1:%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_account_token_check') THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_account_token_check
      CHECK (account_number IS NULL OR account_number LIKE 'enc:v1:%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_laborers_account_token_check') THEN
    ALTER TABLE public.daily_laborers ADD CONSTRAINT daily_laborers_account_token_check
      CHECK (account_number IS NULL OR account_number LIKE 'enc:v1:%');
  END IF;
END $$;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS account_last4 text
  GENERATED ALWAYS AS (CASE WHEN account_number LIKE 'enc:v1:%' THEN split_part(account_number, ':', 3) END) STORED;
ALTER TABLE public.store_join_profiles ADD COLUMN IF NOT EXISTS account_last4 text
  GENERATED ALWAYS AS (CASE WHEN account_number LIKE 'enc:v1:%' THEN split_part(account_number, ':', 3) END) STORED;
ALTER TABLE public.daily_laborers ADD COLUMN IF NOT EXISTS account_last4 text
  GENERATED ALWAYS AS (CASE WHEN account_number LIKE 'enc:v1:%' THEN split_part(account_number, ':', 3) END) STORED;

-- 전체 계좌번호 열람(이체할 때). p_kind: employee(직원 id) / daily_laborer(일용근로자 id) / join_profile(store_members id).
CREATE OR REPLACE FUNCTION public.reveal_account_number(p_kind text, p_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_store uuid; v_owner uuid; v_token text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ACCOUNT_NUMBER_FORBIDDEN' USING ERRCODE = '42501'; END IF;
  IF p_kind = 'employee' THEN
    SELECT store_id, user_id, account_number INTO v_store, v_owner, v_token FROM public.employees WHERE id = p_id;
  ELSIF p_kind = 'daily_laborer' THEN
    SELECT store_id, NULL::uuid, account_number INTO v_store, v_owner, v_token FROM public.daily_laborers WHERE id = p_id;
  ELSIF p_kind = 'join_profile' THEN
    SELECT store_id, applicant_user_id, account_number INTO v_store, v_owner, v_token FROM public.store_join_profiles WHERE member_id = p_id;
  ELSE
    RAISE EXCEPTION 'ACCOUNT_NUMBER_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF v_store IS NULL OR NOT (coalesce(public.is_store_admin(v_store), false) OR v_owner IS NOT DISTINCT FROM auth.uid() AND v_owner IS NOT NULL) THEN
    RAISE EXCEPTION 'ACCOUNT_NUMBER_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN private.reveal_account_token(v_token);
END $$;
REVOKE ALL ON FUNCTION public.reveal_account_number(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_account_number(text, uuid) TO authenticated;

COMMENT ON COLUMN public.employees.account_number IS '암호화 토큰(enc:v1:끝4자리:암호문). 평문 보관 안 함. 열람은 reveal_account_number';
COMMENT ON COLUMN public.store_join_profiles.account_number IS '암호화 토큰(enc:v1:끝4자리:암호문). 평문 보관 안 함';
COMMENT ON COLUMN public.daily_laborers.account_number IS '암호화 토큰(enc:v1:끝4자리:암호문). 평문 보관 안 함';

NOTIFY pgrst, 'reload schema';
COMMIT;
