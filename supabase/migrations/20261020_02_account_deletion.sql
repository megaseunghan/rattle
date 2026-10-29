BEGIN;
-- 소유권을 먼저 넘겨야 계정 탈퇴가 가능하다. 매장 자료는 탈퇴 대상이 아니다.
CREATE OR REPLACE FUNCTION public.assert_account_deletable() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ACCOUNT_AUTH_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM stores WHERE owner_id=auth.uid()) THEN RAISE EXCEPTION 'ACCOUNT_OWNS_STORES'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_account_deletable() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assert_account_deletable() TO authenticated;

CREATE OR REPLACE FUNCTION public.transfer_store_ownership(p_store_id uuid,p_member_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target_user uuid;
BEGIN
  PERFORM 1 FROM stores WHERE id=p_store_id AND owner_id=auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OWNERSHIP_OWNER_REQUIRED'; END IF;
  SELECT user_id INTO target_user FROM store_members WHERE id=p_member_id AND store_id=p_store_id
    AND status='approved' AND user_id<>auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OWNERSHIP_APPROVED_MEMBER_REQUIRED'; END IF;
  PERFORM 1 FROM auth.users WHERE id=target_user FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OWNERSHIP_APPROVED_MEMBER_REQUIRED'; END IF;
  UPDATE store_members SET role='admin' WHERE id=p_member_id;
  UPDATE stores SET owner_id=target_user WHERE id=p_store_id;
END $$;
REVOKE ALL ON FUNCTION public.transfer_store_ownership(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transfer_store_ownership(uuid,uuid) TO authenticated;

-- 삭제 전 외부 작업을 하지 않는다. Auth 삭제 트랜잭션 안에서 재처리 항목을 생성한다.
CREATE TABLE public.account_unlink_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL CHECK(provider='kakao'),
  provider_subject text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,provider)
);
ALTER TABLE public.account_unlink_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_unlink_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.account_unlink_jobs TO service_role;
CREATE INDEX account_unlink_retry ON public.account_unlink_jobs(next_attempt_at) WHERE attempts<8;

-- 보관할 업무 기록의 작성자 FK는 계정만 연결 해제한다.
ALTER TABLE public.cleaning_logs ALTER COLUMN checked_by DROP NOT NULL;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT c.conname, n.nspname, t.relname, a.attname FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=c.conkey[1]
    WHERE c.contype='f' AND c.confrelid='auth.users'::regclass AND array_length(c.conkey,1)=1
      AND n.nspname='public' AND t.relname IN ('cleaning_logs','manual_sales','schedule_requests','attendance_corrections')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',r.nspname,r.relname,r.conname);
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL',r.nspname,r.relname,r.conname,r.attname);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.prepare_auth_account_deletion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM stores WHERE owner_id=OLD.id) THEN RAISE EXCEPTION 'ACCOUNT_OWNS_STORES'; END IF;
  INSERT INTO public.account_unlink_jobs(user_id,provider,provider_subject)
    SELECT OLD.id,'kakao',coalesce(identity_data->>'sub',provider_id)
    FROM auth.identities WHERE user_id=OLD.id AND provider='kakao'
      AND length(coalesce(identity_data->>'sub',provider_id,''))>0
    ON CONFLICT(user_id,provider) DO NOTHING;
  UPDATE public.cleaning_logs SET checked_by_name='탈퇴한 사용자' WHERE checked_by=OLD.id;
  RETURN OLD;
END $$;
CREATE TRIGGER prepare_auth_account_deletion BEFORE DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.prepare_auth_account_deletion();

-- 구형 클라이언트가 공용 매장 자료를 삭제하는 RPC를 계속 호출하지 못하게 한다.
CREATE OR REPLACE FUNCTION public.delete_user_data() RETURNS void
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN RAISE EXCEPTION 'ACCOUNT_DELETE_VIA_AUTH_ONLY'; END $$;
REVOKE ALL ON FUNCTION public.delete_user_data() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.claim_account_unlinks(p_user_id uuid DEFAULT NULL)
RETURNS SETOF public.account_unlink_jobs LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE account_unlink_jobs SET attempts=attempts+1,next_attempt_at=now()+interval '5 minutes'
  WHERE id IN (SELECT id FROM account_unlink_jobs WHERE (p_user_id IS NULL OR user_id=p_user_id)
    AND attempts<8 AND next_attempt_at<=now() ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 5)
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_account_unlinks(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_unlinks(uuid) TO service_role;
COMMIT;
