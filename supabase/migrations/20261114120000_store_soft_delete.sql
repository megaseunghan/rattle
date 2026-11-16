BEGIN;

-- 매장 삭제 7일 유예(소프트 삭제) + 기한 경과 후 파기.
-- 정책: docs/개인정보처리방침-보완안-2026-11-14.md 3·4항.
-- - 기록이 없는 매장은 기존 delete_empty_owned_store로 즉시 삭제한다.
-- - 기록 또는 다른 구성원이 있는 매장은 7일 동안 숨긴 뒤 파기한다. 이 기간에는 소유자만 복구할 수 있다.
-- - POS가 연결된 매장은 웹훅 기록이 계속 들어오므로 연결 해제 전에는 삭제할 수 없다.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS purge_after timestamptz;

ALTER TABLE public.stores DROP CONSTRAINT IF EXISTS stores_deletion_state_chk;
ALTER TABLE public.stores ADD CONSTRAINT stores_deletion_state_chk CHECK (
  (deleted_at IS NULL AND purge_after IS NULL AND deleted_by IS NULL)
  OR (deleted_at IS NOT NULL AND purge_after IS NOT NULL AND purge_after > deleted_at)
);
CREATE INDEX IF NOT EXISTS stores_purge_due ON public.stores(purge_after) WHERE deleted_at IS NOT NULL;

-- 삭제 대기 매장은 정상 매장이 아니다. RLS·SECURITY DEFINER 함수가 같은 판정을 쓰도록 한 곳에 둔다.
CREATE OR REPLACE FUNCTION public.is_store_active(sid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.stores WHERE id = sid AND deleted_at IS NULL);
$$;
REVOKE ALL ON FUNCTION public.is_store_active(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_store_active(uuid) TO authenticated;

-- RLS용: 삭제 대기 매장 집합(보통 매우 작음). 정책에서 (SELECT ...)로 감싸 문장당 1회만 계산한다.
CREATE OR REPLACE FUNCTION public.deleted_store_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce(array_agg(id), '{}'::uuid[]) FROM public.stores WHERE deleted_at IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.deleted_store_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deleted_store_ids() TO authenticated;

-- 쓰기 차단: SECURITY DEFINER RPC·service_role 웹훅은 RLS를 우회하므로 트리거로 막는다.
-- 파기 함수만 트랜잭션 로컬 설정 rattle.store_purge=on으로 우회한다(감사 트리거의 이력 INSERT 등).
CREATE OR REPLACE FUNCTION public.guard_deleted_store_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target uuid;
BEGIN
  IF current_setting('rattle.store_purge', true) = 'on' THEN RETURN NEW; END IF;
  target := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
  IF target IS NOT NULL AND EXISTS (SELECT 1 FROM public.stores WHERE id = target AND deleted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'STORE_DELETED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_deleted_store_write() FROM PUBLIC, anon, authenticated;

-- 삭제 대기 매장 행 자체의 변경(소유권 이전, 공유 범위, POS 매칭 등)도 막는다. 복구(deleted_at 해제)만 허용.
CREATE OR REPLACE FUNCTION public.guard_deleted_store_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('rattle.store_purge', true) = 'on' THEN RETURN NEW; END IF;
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'STORE_DELETED'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_deleted_store_row() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_deleted_store_row ON public.stores;
CREATE TRIGGER guard_deleted_store_row BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.guard_deleted_store_row();

-- 기존 접근 판정 함수: 시그니처·의미는 유지하고 삭제 대기 매장만 제외한다.
CREATE OR REPLACE FUNCTION is_store_admin(sid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM stores WHERE id = sid AND owner_id = auth.uid() AND deleted_at IS NULL
    UNION
    SELECT 1 FROM store_members m JOIN stores s ON s.id = m.store_id AND s.deleted_at IS NULL
      WHERE m.store_id = sid AND m.user_id = auth.uid()
        AND m.role = 'admin' AND m.status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION is_store_member(sid UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM stores WHERE id = sid AND owner_id = auth.uid() AND deleted_at IS NULL
    UNION
    SELECT 1 FROM store_members m JOIN stores s ON s.id = m.store_id AND s.deleted_at IS NULL
      WHERE m.store_id = sid AND m.user_id = auth.uid() AND m.status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION user_has_store_access(sid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM stores WHERE id = sid AND owner_id = auth.uid() AND deleted_at IS NULL)
      OR EXISTS (
        SELECT 1 FROM store_members m JOIN stores s ON s.id = m.store_id AND s.deleted_at IS NULL
        WHERE m.store_id = sid
          AND m.user_id = auth.uid()
          AND m.status = 'approved'
      );
$$;

-- 기존 허용 정책과 관계없이 삭제 대기 매장 자료를 막는다(RESTRICTIVE는 허용 정책과 AND로 결합).
DROP POLICY IF EXISTS deleted_store_guard ON public.stores;
CREATE POLICY deleted_store_guard ON public.stores AS RESTRICTIVE FOR ALL TO authenticated
  USING (deleted_at IS NULL) WITH CHECK (deleted_at IS NULL);

-- stores를 직접 참조하는 모든 public 테이블에 읽기 가드(RESTRICTIVE 정책)와 쓰기 가드(트리거)를 단다.
-- 이후 stores를 참조하는 테이블을 추가하면 같은 정책·트리거를 함께 추가해야 한다(검증 스크립트가 누락을 잡는다).
DO $$
DECLARE r record; policy_name text; trigger_name text;
BEGIN
  FOR r IN
    SELECT n.nspname, t.relname, a.attname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.stores'::regclass
      AND array_length(c.conkey, 1) = 1 AND n.nspname = 'public'
  LOOP
    policy_name := left('deleted_store_guard_' || r.attname, 63);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, r.nspname, r.relname);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%I IS NULL OR NOT (%I = ANY (COALESCE((SELECT public.deleted_store_ids()), ''{}''::uuid[])))) WITH CHECK (%I IS NULL OR NOT (%I = ANY (COALESCE((SELECT public.deleted_store_ids()), ''{}''::uuid[]))))',
      policy_name, r.nspname, r.relname, r.attname, r.attname, r.attname, r.attname);
    trigger_name := left('guard_deleted_store_' || r.attname, 63);
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I', trigger_name, r.nspname, r.relname);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.guard_deleted_store_write(%L)',
      trigger_name, r.nspname, r.relname, r.attname);
  END LOOP;
END $$;

-- 소유자 삭제: 빈 매장은 즉시 삭제, 그 외에는 7일 유예.
CREATE OR REPLACE FUNCTION public.delete_owned_store(p_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  caller_id uuid := auth.uid();
  target public.stores;
  due timestamptz;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'STORE_DELETE_AUTH_REQUIRED'; END IF;
  SELECT * INTO target FROM public.stores WHERE id = p_store_id AND owner_id = caller_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STORE_DELETE_OWNER_REQUIRED'; END IF;
  IF target.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'STORE_DELETE_ALREADY_SCHEDULED'; END IF;
  IF target.toss_merchant_id IS NOT NULL THEN RAISE EXCEPTION 'STORE_DELETE_POS_CONNECTED'; END IF;

  BEGIN
    PERFORM public.delete_empty_owned_store(p_store_id);
    RETURN jsonb_build_object('mode', 'deleted', 'purge_after', NULL);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT IN ('STORE_DELETE_HAS_DATA', 'STORE_DELETE_HAS_MEMBERS') THEN RAISE; END IF;
  END;

  due := now() + interval '7 days';
  UPDATE public.stores SET deleted_at = now(), deleted_by = caller_id, purge_after = due
  WHERE id = p_store_id;
  RETURN jsonb_build_object('mode', 'scheduled', 'purge_after', due);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_owned_store(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_owned_store(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_deleted_store(p_store_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE caller_id uuid := auth.uid(); target public.stores;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'STORE_RESTORE_AUTH_REQUIRED'; END IF;
  SELECT * INTO target FROM public.stores WHERE id = p_store_id AND owner_id = caller_id FOR UPDATE;
  IF NOT FOUND OR target.deleted_at IS NULL THEN RAISE EXCEPTION 'STORE_RESTORE_NOT_FOUND'; END IF;
  IF target.purge_after <= now() THEN RAISE EXCEPTION 'STORE_RESTORE_EXPIRED'; END IF;
  UPDATE public.stores SET deleted_at = NULL, deleted_by = NULL, purge_after = NULL WHERE id = p_store_id;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_deleted_store(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_deleted_store(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_my_deleted_stores()
RETURNS TABLE(id uuid, name text, deleted_at timestamptz, purge_after timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.name, s.deleted_at, s.purge_after FROM public.stores s
  WHERE s.owner_id = auth.uid() AND s.deleted_at IS NOT NULL AND s.purge_after > now()
  ORDER BY s.purge_after;
$$;
REVOKE ALL ON FUNCTION public.list_my_deleted_stores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_deleted_stores() TO authenticated;

-- 파기 실패 기록(개인정보 파기 의무 확인용). 앱 사용자는 접근할 수 없다.
CREATE TABLE IF NOT EXISTS public.store_purge_failures (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id uuid NOT NULL,
  sqlstate text NOT NULL,
  message text NOT NULL,
  failed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_purge_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_purge_failures FROM PUBLIC, anon, authenticated;

-- 기한 경과 매장 파기. 일반 사용자는 호출할 수 없다. pg_cron(postgres 권한)·service_role이 실행한다.
-- employees·recurring 규칙에는 RESTRICT 참조가 있어 CASCADE 전에 하위 기록을 순서대로 지운다.
CREATE OR REPLACE FUNCTION public.purge_expired_deleted_stores()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target uuid; purged integer := 0;
BEGIN
  PERFORM set_config('rattle.store_purge', 'on', true);
  FOR target IN
    SELECT id FROM public.stores WHERE deleted_at IS NOT NULL AND purge_after <= now()
    ORDER BY purge_after FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      DELETE FROM public.recurring_fixed_expense_versions v
        USING public.recurring_fixed_expenses r WHERE v.rule_id = r.id AND r.store_id = target;
      DELETE FROM public.recurring_fixed_expenses WHERE store_id = target;
      DELETE FROM public.payroll WHERE store_id = target;
      DELETE FROM public.payroll_work_submissions WHERE store_id = target;
      DELETE FROM public.payroll_daily_work_history WHERE store_id = target;
      DELETE FROM public.payroll_daily_work WHERE store_id = target;
      DELETE FROM public.stores WHERE id = target AND deleted_at IS NOT NULL AND purge_after <= now();
      purged := purged + 1;
    EXCEPTION WHEN OTHERS THEN
      -- 한 매장 실패가 다른 매장 파기를 막지 않게 하고, 다음 실행에서 다시 시도한다.
      INSERT INTO public.store_purge_failures(store_id, sqlstate, message) VALUES (target, SQLSTATE, SQLERRM);
      RAISE WARNING 'STORE_PURGE_FAILED store=% sqlstate=% message=%', target, SQLSTATE, SQLERRM;
    END;
  END LOOP;
  PERFORM set_config('rattle.store_purge', 'off', true);
  RETURN purged;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_deleted_stores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_deleted_stores() TO service_role;

-- 삭제 대기 매장만 남은 소유자의 탈퇴 안내를 구분하기 위한 오류 코드는 기존 ACCOUNT_OWNS_STORES를 유지한다.
-- (유예 기간 동안은 복구 가능성 때문에 소유자 탈퇴를 막는다.)

COMMIT;
