-- 역할 모델 4단계. 선행: core → visibility → manager_rpc_policy.
-- 비소유 admin만 member로 정리. 점장 자동 지정/직원/급여/근태 변경 없음.
-- 적용 실패 시 전체 ROLLBACK. 커밋 후 role 복구 대신 새 보정 migration 사용.
BEGIN;
-- Exact table lock prevents concurrent INSERT/role/ownership changes during cleanup.
LOCK TABLE public.stores,public.store_members IN SHARE ROW EXCLUSIVE MODE;
-- Migration-only, transactional disable: no persistent GUC/service bypass is introduced.
ALTER TABLE public.store_members DISABLE TRIGGER role_model_legacy_role_guard;
UPDATE public.store_members m SET role='member'
FROM public.stores s WHERE s.id=m.store_id AND m.user_id IS DISTINCT FROM s.owner_id AND m.role='admin';
ALTER TABLE public.store_members ENABLE TRIGGER role_model_legacy_role_guard;
COMMIT;
