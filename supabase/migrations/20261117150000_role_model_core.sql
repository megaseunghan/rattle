-- 점장 역할 핵심 / 사용자 확정 2026-11-17 / task_90906d6dcc29.
-- 근거: docs/역할-권한-설계-2026-11-17.md, PL 전달 확정 사항, 점장 DB 설계 2·7장.
-- 선행: 직원 계정 연결·합류·소유권 이전·soft delete 및 QR hardening → policy.
-- 적용: 이 파일만으로 legacy 비소유자 admin의 관리 권한을 제거한다. role 값의 물리 강등은 후속 단계.
-- 제외: 3공유 조회 projection, QR 세부 승인/직접 기록·스케줄 자기 변경 가드는 후속 단계.
-- 원격 미적용. 실패 시 ROLLBACK; 적용 후 새 보정으로 복구하며 legacy admin 권한을 되살리지 않는다.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;

-- 복합 FK로 같은 매장의 직원/멤버만 지정. 상태 행은 해제 후에도 revision을 보존한다.
CREATE UNIQUE INDEX IF NOT EXISTS role_model_members_id_store ON public.store_members(id,store_id);
CREATE UNIQUE INDEX IF NOT EXISTS role_model_employees_id_store ON public.employees(id,store_id);
CREATE TABLE IF NOT EXISTS private.store_managers (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  member_id uuid,
  employee_id uuid,
  user_id uuid,
  assigned_by uuid,
  assigned_at timestamptz,
  revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
  last_event text NOT NULL DEFAULT 'initialized',
  FOREIGN KEY(member_id,store_id) REFERENCES public.store_members(id,store_id),
  FOREIGN KEY(employee_id,store_id) REFERENCES public.employees(id,store_id),
  CHECK ((member_id IS NULL AND employee_id IS NULL AND user_id IS NULL AND assigned_by IS NULL AND assigned_at IS NULL)
      OR (member_id IS NOT NULL AND employee_id IS NOT NULL AND user_id IS NOT NULL AND assigned_by IS NOT NULL AND assigned_at IS NOT NULL))
);
-- 감사 INSERT에서 부모 store/auth FK 잠금을 다시 잡으면 employee→state→store 순환이 생긴다.
-- 식별자 스냅샷만 저장하고 매장 실제 삭제 시 아래 cleanup에서 함께 제거한다.
CREATE TABLE IF NOT EXISTS private.store_manager_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id uuid NOT NULL,
  revision bigint NOT NULL,
  event text NOT NULL,
  previous_member_id uuid, previous_employee_id uuid, previous_user_id uuid,
  member_id uuid, employee_id uuid, user_id uuid,
  actor_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(store_id,revision)
);
-- 직접 owner_id UPDATE는 사장도 금지. 공식 이전 RPC가 만든 1회용 트랜잭션 표지만 소비한다.
-- caller가 설정할 수 있는 GUC/current_user/trigger depth를 이전 권한으로 사용하지 않는다.
CREATE TABLE IF NOT EXISTS private.store_owner_transfers (
  transaction_id bigint NOT NULL,
  store_id uuid NOT NULL,
  previous_owner_id uuid NOT NULL,
  next_owner_id uuid NOT NULL,
  PRIMARY KEY(transaction_id,store_id)
);
ALTER TABLE private.store_managers ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.store_manager_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.store_owner_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.store_managers,private.store_manager_events,private.store_owner_transfers FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE private.store_manager_events_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.audit_store_manager_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
  IF NEW.revision<>OLD.revision+1 THEN RAISE EXCEPTION 'MANAGER_REVISION_INVALID'; END IF;
  INSERT INTO private.store_manager_events(store_id,revision,event,previous_member_id,previous_employee_id,previous_user_id,
    member_id,employee_id,user_id,actor_id)
  VALUES(NEW.store_id,NEW.revision,NEW.last_event,OLD.member_id,OLD.employee_id,OLD.user_id,
    NEW.member_id,NEW.employee_id,NEW.user_id,auth.uid());
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS audit_store_manager_change ON private.store_managers;
CREATE TRIGGER audit_store_manager_change AFTER UPDATE ON private.store_managers
FOR EACH ROW EXECUTE FUNCTION private.audit_store_manager_change();

CREATE OR REPLACE FUNCTION private.clear_store_manager(
  p_store_id uuid,p_event text,p_member_id uuid DEFAULT NULL,p_employee_id uuid DEFAULT NULL,p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE target private.store_managers;
BEGIN
  FOR target IN SELECT * FROM private.store_managers sm WHERE sm.member_id IS NOT NULL
    AND (p_store_id IS NULL OR sm.store_id=p_store_id)
    AND (p_member_id IS NULL OR sm.member_id=p_member_id)
    AND (p_employee_id IS NULL OR sm.employee_id=p_employee_id)
    AND (p_user_id IS NULL OR sm.user_id=p_user_id)
    ORDER BY sm.store_id FOR UPDATE
  LOOP
    UPDATE private.store_managers SET member_id=NULL,employee_id=NULL,user_id=NULL,assigned_by=NULL,assigned_at=NULL,
      revision=revision+1,last_event=p_event WHERE store_id=target.store_id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.is_store_owner(p_store_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.stores s
    WHERE s.id=p_store_id AND s.owner_id=auth.uid() AND s.deleted_at IS NULL);
$$;
CREATE OR REPLACE FUNCTION public.is_store_manager(p_store_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS(
    SELECT 1 FROM private.store_managers sm JOIN public.stores s ON s.id=sm.store_id
    JOIN public.store_members m ON m.id=sm.member_id AND m.store_id=sm.store_id AND m.user_id=sm.user_id AND m.status='approved'
    JOIN public.employees e ON e.id=sm.employee_id AND e.store_id=sm.store_id AND e.user_id=sm.user_id AND e.is_active
    JOIN auth.users u ON u.id=sm.user_id
    WHERE sm.store_id=p_store_id AND sm.user_id=auth.uid() AND s.owner_id<>sm.user_id AND s.deleted_at IS NULL);
$$;
-- sid 인자명/boolean 반환 유지. raw store_members.role 값은 관리 권한 근거에서 제거한다.
CREATE OR REPLACE FUNCTION public.is_store_admin(sid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
  SELECT public.is_store_owner(sid) OR public.is_store_manager(sid);
$$;

CREATE OR REPLACE FUNCTION public.set_store_manager(p_store_id uuid,p_member_id uuid,p_expected_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE candidate public.store_members; emp public.employees; current_state private.store_managers; candidate_user uuid;
BEGIN
  IF NOT public.is_store_owner(p_store_id) THEN RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'MANAGER_INPUT_INVALID'; END IF;
  IF p_member_id IS NOT NULL THEN
    SELECT user_id INTO candidate_user FROM public.store_members WHERE id=p_member_id AND store_id=p_store_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'MANAGER_CANDIDATE_INVALID'; END IF;
    -- Auth 삭제 → member, 합류 승인 member → store → employee 순서를 따른다.
    PERFORM 1 FROM auth.users WHERE id=candidate_user FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MANAGER_CANDIDATE_INVALID'; END IF;
    SELECT * INTO candidate FROM public.store_members WHERE id=p_member_id AND store_id=p_store_id
      AND user_id=candidate_user AND status='approved' FOR SHARE;
    IF NOT FOUND OR candidate.user_id=auth.uid() THEN RAISE EXCEPTION 'MANAGER_CANDIDATE_INVALID'; END IF;
  END IF;
  -- member → store → employee 순서를 유지한다. NO KEY UPDATE는 직원 저장이
  -- employee를 잡은 뒤 취하는 store FK KEY SHARE와 호환되어 M1 역전을 제거한다.
  -- owner 이전/합류의 store UPDATE와는 여전히 직렬화된다.
  PERFORM 1 FROM public.stores WHERE id=p_store_id AND owner_id=auth.uid() AND deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_member_id IS NOT NULL THEN
    SELECT * INTO emp FROM public.employees WHERE store_id=p_store_id AND user_id=candidate_user AND is_active FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'MANAGER_CANDIDATE_INVALID'; END IF;
  END IF;
  INSERT INTO private.store_managers(store_id) VALUES(p_store_id) ON CONFLICT(store_id) DO NOTHING;
  SELECT * INTO current_state FROM private.store_managers WHERE store_id=p_store_id FOR UPDATE;
  IF current_state.revision<>p_expected_revision THEN RAISE EXCEPTION 'MANAGER_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
  IF current_state.member_id IS DISTINCT FROM p_member_id THEN
    UPDATE private.store_managers SET member_id=p_member_id,employee_id=emp.id,user_id=candidate.user_id,
      assigned_by=CASE WHEN p_member_id IS NULL THEN NULL ELSE auth.uid() END,
      assigned_at=CASE WHEN p_member_id IS NULL THEN NULL ELSE clock_timestamp() END,
      revision=revision+1,last_event=CASE WHEN p_member_id IS NULL THEN 'owner_cleared' ELSE 'owner_assigned' END
    WHERE store_id=p_store_id RETURNING * INTO current_state;
  END IF;
  RETURN jsonb_build_object('store_id',current_state.store_id,'member_id',current_state.member_id,
    'employee_id',current_state.employee_id,'user_id',current_state.user_id,
    'assigned_at',current_state.assigned_at,'revision',current_state.revision::text);
END $$;

CREATE OR REPLACE FUNCTION public.get_my_store_access(p_store_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE owner_access boolean; manager_access boolean; emp public.employees; sm private.store_managers; member_access boolean;
BEGIN
  owner_access:=public.is_store_owner(p_store_id); manager_access:=public.is_store_manager(p_store_id);
  member_access:=EXISTS(SELECT 1 FROM public.store_members m JOIN public.stores s ON s.id=m.store_id
    WHERE m.store_id=p_store_id AND m.user_id=auth.uid() AND m.status='approved' AND s.deleted_at IS NULL);
  IF auth.uid() IS NULL OR NOT(owner_access OR member_access) THEN RAISE EXCEPTION 'STORE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO emp FROM public.employees WHERE store_id=p_store_id AND user_id=auth.uid() AND is_active;
  SELECT * INTO sm FROM private.store_managers WHERE store_id=p_store_id;
  RETURN jsonb_build_object('store_id',p_store_id,
    'role',CASE WHEN owner_access THEN 'owner' WHEN manager_access THEN 'manager'
      WHEN emp.id IS NULL THEN NULL WHEN emp.employment_type='part_time' THEN 'part_timer' ELSE 'employee' END,
    'employee_id',emp.id,'is_owner',owner_access,'is_manager',manager_access,
    'can_manage_store',owner_access OR manager_access,'can_manage_managers',owner_access,
    'can_manage_visibility',owner_access,'can_transfer_ownership',owner_access,'can_delete_store',owner_access,
    'can_view_owner_dashboard',owner_access,'manager_member_id',CASE WHEN owner_access OR manager_access THEN sm.member_id END,
    'manager_employee_id',CASE WHEN owner_access OR manager_access THEN sm.employee_id END,
    'manager_revision',coalesce(sm.revision,0)::text);
END $$;

CREATE OR REPLACE FUNCTION private.revoke_store_manager_on_employee_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.user_id=auth.uid() AND public.is_store_manager(OLD.store_id) AND NOT public.is_store_owner(OLD.store_id) THEN
      RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501';
    END IF;
    PERFORM private.clear_store_manager(OLD.store_id,'employee_deleted',NULL,OLD.id);
    RETURN OLD;
  END IF;
  IF OLD.user_id=auth.uid() AND public.is_store_manager(OLD.store_id) AND NOT public.is_store_owner(OLD.store_id)
    AND (NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.store_id IS DISTINCT FROM OLD.store_id OR NOT NEW.is_active) THEN
    RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.store_id IS DISTINCT FROM OLD.store_id OR NOT NEW.is_active THEN
    PERFORM private.clear_store_manager(OLD.store_id,'employee_changed',NULL,OLD.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS role_model_employee_revoke ON public.employees;
CREATE TRIGGER role_model_employee_revoke BEFORE UPDATE OR DELETE ON public.employees
FOR EACH ROW EXECUTE FUNCTION private.revoke_store_manager_on_employee_change();

CREATE OR REPLACE FUNCTION private.revoke_store_manager_on_member_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM private.clear_store_manager(OLD.store_id,'member_deleted',OLD.id);
    RETURN OLD;
  END IF;
  IF NEW.status<>'approved' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.store_id IS DISTINCT FROM OLD.store_id THEN
    PERFORM private.clear_store_manager(OLD.store_id,'member_changed',OLD.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS role_model_member_revoke ON public.store_members;
CREATE TRIGGER role_model_member_revoke BEFORE UPDATE OR DELETE ON public.store_members
FOR EACH ROW EXECUTE FUNCTION private.revoke_store_manager_on_member_change();

CREATE OR REPLACE FUNCTION private.revoke_store_manager_on_account_delete() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
  PERFORM private.clear_store_manager(NULL,'account_deleted',NULL,NULL,OLD.id);
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS role_model_account_revoke ON auth.users;
CREATE TRIGGER role_model_account_revoke BEFORE DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.revoke_store_manager_on_account_delete();

CREATE OR REPLACE FUNCTION private.sync_store_manager_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO private.store_managers(store_id) VALUES(NEW.id) ON CONFLICT(store_id) DO NOTHING;
    RETURN NEW;
  ELSIF TG_OP='DELETE' THEN
    DELETE FROM private.store_manager_events WHERE store_id=OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    PERFORM private.clear_store_manager(OLD.id,'ownership_transferred');
  ELSIF NEW.deleted_at IS NOT NULL THEN
    PERFORM private.clear_store_manager(OLD.id,'store_inactive');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS role_model_store_state ON public.stores;
CREATE TRIGGER role_model_store_state AFTER INSERT OR UPDATE OR DELETE ON public.stores
FOR EACH ROW EXECUTE FUNCTION private.sync_store_manager_state();
INSERT INTO private.store_managers(store_id) SELECT id FROM public.stores ON CONFLICT(store_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.guard_store_owner_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
  IF (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
      OR NEW.purge_after IS DISTINCT FROM OLD.purge_after) AND auth.uid() IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501';
  END IF;
  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    DELETE FROM private.store_owner_transfers WHERE transaction_id=txid_current() AND store_id=OLD.id
      AND previous_owner_id=OLD.owner_id AND next_owner_id=NEW.owner_id AND previous_owner_id=auth.uid();
    IF NOT FOUND THEN RAISE EXCEPTION 'OWNERSHIP_TRANSFER_REQUIRED' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS role_model_owner_guard ON public.stores;
CREATE TRIGGER role_model_owner_guard BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.guard_store_owner_change();

CREATE OR REPLACE FUNCTION public.guard_legacy_member_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
  IF (TG_OP='INSERT' AND NEW.role<>'member') OR (TG_OP='UPDATE' AND NEW.role IS DISTINCT FROM OLD.role) THEN
    IF NOT public.is_store_owner(NEW.store_id) THEN RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS role_model_legacy_role_guard ON public.store_members;
CREATE TRIGGER role_model_legacy_role_guard BEFORE INSERT OR UPDATE ON public.store_members
FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_member_role();

CREATE OR REPLACE FUNCTION public.transfer_store_ownership(p_store_id uuid,p_member_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE candidate public.store_members; candidate_user uuid;
BEGIN
  IF NOT public.is_store_owner(p_store_id) THEN RAISE EXCEPTION 'OWNERSHIP_OWNER_REQUIRED'; END IF;
  SELECT user_id INTO candidate_user FROM public.store_members WHERE id=p_member_id AND store_id=p_store_id;
  PERFORM 1 FROM auth.users WHERE id=candidate_user FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OWNERSHIP_APPROVED_MEMBER_REQUIRED'; END IF;
  SELECT * INTO candidate FROM public.store_members WHERE id=p_member_id AND store_id=p_store_id
    AND user_id=candidate_user AND status='approved' AND user_id<>auth.uid() FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OWNERSHIP_APPROVED_MEMBER_REQUIRED'; END IF;
  PERFORM 1 FROM public.stores WHERE id=p_store_id AND owner_id=auth.uid() AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OWNERSHIP_OWNER_REQUIRED'; END IF;
  INSERT INTO private.store_owner_transfers(transaction_id,store_id,previous_owner_id,next_owner_id)
    VALUES(txid_current(),p_store_id,auth.uid(),candidate.user_id);
  -- role을 올리지 않는다. 옛 사장에게 admin 값이 남아도 관리 권한은 없다.
  UPDATE public.stores SET owner_id=candidate.user_id WHERE id=p_store_id;
END $$;

-- raw admin 허용 경로도 helper와 함께 교체하여 후속 role 강등 전에도 닫는다.
DROP POLICY IF EXISTS stores_update_owner_or_admin ON public.stores;
CREATE POLICY stores_update_owner_or_admin ON public.stores FOR UPDATE TO authenticated
USING(public.is_store_admin(id)) WITH CHECK(public.is_store_admin(id));
DROP POLICY IF EXISTS store_members_update ON public.store_members;
CREATE POLICY store_members_update ON public.store_members FOR UPDATE TO authenticated
USING(public.is_store_admin(store_id)) WITH CHECK(public.is_store_admin(store_id));
DROP POLICY IF EXISTS store_members_delete ON public.store_members;
CREATE POLICY store_members_delete ON public.store_members FOR DELETE TO authenticated
USING(user_id=auth.uid() OR public.is_store_admin(store_id));
DROP POLICY IF EXISTS attendance_modify_admin ON public.attendance;
CREATE POLICY attendance_modify_admin ON public.attendance FOR DELETE TO authenticated USING(public.is_store_admin(store_id));

-- 현재 직접 role admin을 검사하는 잔존 경로는 위 정책과 QR helper다.
-- QR helper는 호출자의 is_store_admin 검사와 함께 닫히며 점장 세부 적응은 후속 단계다.
-- 기본 권한에 의존하지 않는다. 내부 함수는 클라이언트가 직접 실행할 수 없다.
REVOKE ALL ON FUNCTION private.audit_store_manager_change(),private.clear_store_manager(uuid,text,uuid,uuid,uuid),
  private.revoke_store_manager_on_employee_change(),private.revoke_store_manager_on_member_change(),
  private.revoke_store_manager_on_account_delete(),private.sync_store_manager_state(),
  public.guard_store_owner_change(),public.guard_legacy_member_role() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.is_store_owner(uuid),public.is_store_manager(uuid),public.is_store_admin(uuid),
  public.set_store_manager(uuid,uuid,bigint),public.get_my_store_access(uuid),public.transfer_store_ownership(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.is_store_owner(uuid),public.is_store_manager(uuid),public.is_store_admin(uuid),
  public.set_store_manager(uuid,uuid,bigint),public.get_my_store_access(uuid),public.transfer_store_ownership(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
