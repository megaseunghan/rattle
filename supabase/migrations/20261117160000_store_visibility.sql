-- 세 열람 설정 + 공유용 allowlist 조회 / 사용자 확정 2026-11-17.
-- 선행: financial sharing / daily labor / QR policy / 20261117150000_role_model_core.sql.
-- 원자료는 관리 또는 본인, 타인 공유는 별도 읽기 RPC. 급여·인사·근태 원본을 재작성하지 않는다.
-- 원격 미적용. 실패 시 전체 ROLLBACK. 적용 후 복구는 새 보정으로 공유를 닫고 원본/정책 이력은 보존.
BEGIN;
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS attendance_share_scope text NOT NULL DEFAULT 'none'
  CHECK(attendance_share_scope IN ('none','regular_only','all_staff'));
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS payroll_share_scope text NOT NULL DEFAULT 'none'
  CHECK(payroll_share_scope IN ('none','regular_only','all_staff'));
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS visibility_revision bigint NOT NULL DEFAULT 0 CHECK(visibility_revision>=0);
ALTER TABLE public.stores ALTER COLUMN financial_share_scope SET DEFAULT 'none';

CREATE OR REPLACE FUNCTION private.can_read_shared_domain(p_store_id uuid,p_domain text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND (public.is_store_admin(p_store_id) OR EXISTS(
    SELECT 1 FROM public.stores s
    JOIN public.store_members m ON m.store_id=s.id AND m.user_id=auth.uid() AND m.status='approved'
    JOIN public.employees e ON e.store_id=s.id AND e.user_id=auth.uid() AND e.is_active
    WHERE s.id=p_store_id AND s.deleted_at IS NULL AND (
      CASE p_domain WHEN 'financial' THEN s.financial_share_scope WHEN 'attendance' THEN s.attendance_share_scope
        WHEN 'payroll' THEN s.payroll_share_scope END='all_staff'
      OR (CASE p_domain WHEN 'financial' THEN s.financial_share_scope WHEN 'attendance' THEN s.attendance_share_scope
        WHEN 'payroll' THEN s.payroll_share_scope END='regular_only' AND e.employment_type='regular'))));
$$;
CREATE OR REPLACE FUNCTION public.can_read_store_financials(p_store_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT private.can_read_shared_domain(p_store_id,'financial');
$$;
CREATE OR REPLACE FUNCTION public.can_read_other_attendance(p_store_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT private.can_read_shared_domain(p_store_id,'attendance');
$$;
CREATE OR REPLACE FUNCTION public.can_read_other_payroll(p_store_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT private.can_read_shared_domain(p_store_id,'payroll');
$$;
-- 공유 또는 재직 여부와 무관한 본인 읽기. 삭제된 매장은 기존 전체 접근 차단을 유지한다.
CREATE OR REPLACE FUNCTION public.can_read_employee(p_store_id uuid,p_employee_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.stores s WHERE s.id=p_store_id AND s.deleted_at IS NULL)
   AND (public.is_store_admin(p_store_id) OR EXISTS(SELECT 1 FROM public.employees e
     WHERE e.id=p_employee_id AND e.store_id=p_store_id AND e.user_id=auth.uid()));
$$;
CREATE OR REPLACE FUNCTION private.assert_store_visibility_access(p_store_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.stores s WHERE s.id=p_store_id AND s.deleted_at IS NULL)
 OR NOT(public.is_store_member(p_store_id) OR EXISTS(SELECT 1 FROM public.employees e WHERE e.store_id=p_store_id AND e.user_id=auth.uid()))
 THEN RAISE EXCEPTION 'STORE_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.guard_store_visibility_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE changed boolean;
BEGIN
 changed:=(NEW.financial_share_scope,NEW.attendance_share_scope,NEW.payroll_share_scope)
     IS DISTINCT FROM (OLD.financial_share_scope,OLD.attendance_share_scope,OLD.payroll_share_scope);
 IF (changed OR NEW.visibility_revision IS DISTINCT FROM OLD.visibility_revision) AND auth.uid() IS DISTINCT FROM OLD.owner_id THEN
   RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF changed THEN NEW.visibility_revision:=OLD.visibility_revision+1;
 ELSIF NEW.visibility_revision IS DISTINCT FROM OLD.visibility_revision THEN RAISE EXCEPTION 'VISIBILITY_REVISION_INVALID'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_store_visibility_owner ON public.stores;
CREATE TRIGGER guard_store_visibility_owner BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.guard_store_visibility_owner();
CREATE OR REPLACE FUNCTION public.get_my_store_visibility(p_store_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE s public.stores;
BEGIN
 PERFORM private.assert_store_visibility_access(p_store_id);
 SELECT * INTO s FROM public.stores WHERE id=p_store_id;
 RETURN jsonb_build_object('store_id',s.id,'financial_share_scope',s.financial_share_scope,
   'attendance_share_scope',s.attendance_share_scope,'payroll_share_scope',s.payroll_share_scope,
   'visibility_revision',s.visibility_revision::text,'can_manage_visibility',public.is_store_owner(s.id),
   'can_read_financials',public.can_read_store_financials(s.id),'can_read_other_attendance',public.can_read_other_attendance(s.id),
   'can_read_other_payroll',public.can_read_other_payroll(s.id));
END $$;
CREATE OR REPLACE FUNCTION public.set_store_visibility(p_store_id uuid,p_financial_scope text,p_attendance_scope text,
 p_payroll_scope text,p_expected_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE s public.stores;
BEGIN
 SELECT * INTO s FROM public.stores WHERE id=p_store_id AND owner_id=auth.uid() AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_financial_scope IS NULL OR p_financial_scope NOT IN ('none','regular_only','all_staff')
 OR p_attendance_scope IS NULL OR p_attendance_scope NOT IN ('none','regular_only','all_staff')
 OR p_payroll_scope IS NULL OR p_payroll_scope NOT IN ('none','regular_only','all_staff') THEN RAISE EXCEPTION 'INVALID_SHARE_SCOPE'; END IF;
 IF p_expected_revision IS NULL OR p_expected_revision<0 THEN RAISE EXCEPTION 'VISIBILITY_INPUT_INVALID'; END IF;
 IF s.visibility_revision<>p_expected_revision THEN RAISE EXCEPTION 'VISIBILITY_REVISION_CONFLICT' USING ERRCODE='40001'; END IF;
 UPDATE public.stores SET financial_share_scope=p_financial_scope,attendance_share_scope=p_attendance_scope,payroll_share_scope=p_payroll_scope WHERE id=p_store_id;
 RETURN public.get_my_store_visibility(p_store_id);
END $$;
-- 기존 void 계약 유지. 금융 항목만 바꾸고 근태/급여 값을 덮지 않는다. trigger가 revision을 올린다.
CREATE OR REPLACE FUNCTION public.set_store_financial_sharing(p_store_id uuid,p_scope text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 PERFORM 1 FROM public.stores WHERE id=p_store_id AND owner_id=auth.uid() AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_scope IS NULL OR p_scope NOT IN ('none','regular_only','all_staff') THEN RAISE EXCEPTION 'INVALID_SHARE_SCOPE'; END IF;
 UPDATE public.stores SET financial_share_scope=p_scope WHERE id=p_store_id;
END $$;

-- SELECT 허용 정책과 독립된 restrictive gate로 과거 FOR ALL 정책의 OR 누적도 차단한다.
DO $raw$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['employees','payroll','payroll_work_history','employee_wage_history','payroll_work_submissions',
   'payroll_daily_work','payroll_daily_work_history','attendance','attendance_corrections','employee_schedules','schedule_requests',
   'attendance_punches','attendance_correction_requests'] LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('DROP POLICY IF EXISTS visibility_raw_read ON public.%I',t);
   EXECUTE format('DROP POLICY IF EXISTS visibility_raw_gate ON public.%I',t);
   EXECUTE format('CREATE POLICY visibility_raw_read ON public.%I FOR SELECT TO authenticated USING(public.can_read_employee(store_id,%I))',t,CASE WHEN t='employees' THEN 'id' ELSE 'employee_id' END);
   EXECUTE format('CREATE POLICY visibility_raw_gate ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(public.can_read_employee(store_id,%I))',t,CASE WHEN t='employees' THEN 'id' ELSE 'employee_id' END);
   EXECUTE format('REVOKE SELECT ON public.%I FROM PUBLIC,anon',t);
   EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;
END $raw$;
DROP POLICY IF EXISTS visibility_join_read ON public.store_join_profiles;
DROP POLICY IF EXISTS visibility_join_gate ON public.store_join_profiles;
CREATE POLICY visibility_join_read ON public.store_join_profiles FOR SELECT TO authenticated
USING(public.is_store_admin(store_id) OR (applicant_user_id=auth.uid() AND public.is_store_active(store_id)));
CREATE POLICY visibility_join_gate ON public.store_join_profiles AS RESTRICTIVE FOR SELECT TO authenticated
USING(public.is_store_admin(store_id) OR (applicant_user_id=auth.uid() AND public.is_store_active(store_id)));
REVOKE SELECT ON public.store_join_profiles FROM PUBLIC,anon;
GRANT SELECT ON public.store_join_profiles TO authenticated;
-- 직원 FK가 없는 레거시 근태 알림 원문은 공유용으로 재사용하지 않는다.
DROP POLICY IF EXISTS visibility_attendance_notification_gate ON public.notifications;
CREATE POLICY visibility_attendance_notification_gate ON public.notifications AS RESTRICTIVE FOR SELECT TO authenticated
USING(category<>'attendance' OR public.is_store_admin(store_id));
ALTER VIEW public.current_employee_wages SET(security_invoker=true);
ALTER VIEW public.attendance_effective_punches SET(security_invoker=true);

CREATE OR REPLACE FUNCTION private.validate_shared_page(p_from date,p_to date,p_limit integer,p_offset integer) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_to<p_from OR p_to-p_from>366 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500
   OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'SHARED_QUERY_INVALID'; END IF;
END $$;
-- 2026-11-17 확정: 일반 공유 대상은 활성·계정 연결 직원만. 관리/본인 과거 읽기는 유지.
-- 사용자 확정 2026-11-17: 타인 공유는 활성·계정 연결된 직원만 대상이다.
-- 비활성/미연결 과거자료는 관리자인 사장·점장 및 현재 연결된 본인만 조회한다.
-- 손익의 역사적 인건비 합계는 이 대상 제한과 별개로 유지한다.
-- QR 유효 기록 + 기존 근태의 실제 시각. 원문/secret/위치/일급/스냅샷은 반환하지 않는다.
CREATE OR REPLACE FUNCTION public.get_shared_attendance(p_store_id uuid,p_from date,p_to date,p_limit integer DEFAULT 200,p_offset integer DEFAULT 0)
RETURNS TABLE(employee_id uuid,employee_name text,kind text,punched_at timestamptz,work_date date,flags text[],status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE shared boolean; managed boolean;
BEGIN
 PERFORM private.assert_store_visibility_access(p_store_id);
 PERFORM private.validate_shared_page(p_from,p_to,p_limit,p_offset);
 managed:=public.is_store_admin(p_store_id);
 shared:=public.can_read_other_attendance(p_store_id);
 RETURN QUERY
 SELECT x.eid,x.name,x.kind,x.event_at,x.event_date,x.flags,x.status FROM (
   SELECT p.employee_id eid,e.name,p.kind,p.punched_at AS event_at,p.work_date AS event_date,p.flags,
     coalesce((SELECT r.status FROM public.attendance_correction_requests r WHERE r.store_id=p_store_id AND r.employee_id=p.employee_id
       AND (r.target_punch_id=p.id OR r.applied_punch_id=p.id OR r.paired_applied_punch_id=p.id) ORDER BY r.created_at DESC,r.id DESC LIMIT 1),'recorded') status,
     p.id sort_id,0 origin
   FROM public.attendance_effective_punches p JOIN public.employees e ON e.id=p.employee_id AND e.store_id=p.store_id
   WHERE p.store_id=p_store_id AND p.work_date BETWEEN p_from AND p_to AND (managed OR e.user_id=auth.uid() OR (shared AND e.is_active AND e.user_id IS NOT NULL))
   UNION ALL
   SELECT a.employee_id,e.name,a.type,a.timestamp,(a.timestamp AT TIME ZONE 'Asia/Seoul')::date,'{}'::text[],'recorded',a.id,1
   FROM public.attendance a JOIN public.employees e ON e.id=a.employee_id AND e.store_id=a.store_id
   WHERE a.store_id=p_store_id AND a.timestamp>=(p_from::timestamp AT TIME ZONE 'Asia/Seoul')
     AND a.timestamp<((p_to+1)::timestamp AT TIME ZONE 'Asia/Seoul') AND (managed OR e.user_id=auth.uid() OR (shared AND e.is_active AND e.user_id IS NOT NULL))
 ) x ORDER BY x.event_date,x.event_at,x.origin,x.sort_id LIMIT p_limit OFFSET p_offset;
END $$;
CREATE OR REPLACE FUNCTION public.get_shared_attendance_requests(p_store_id uuid,p_from date,p_to date,p_limit integer DEFAULT 200,p_offset integer DEFAULT 0)
RETURNS TABLE(employee_id uuid,employee_name text,kind text,requested_time timestamptz,work_date date,status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE shared boolean; managed boolean;
BEGIN
 PERFORM private.assert_store_visibility_access(p_store_id);
 PERFORM private.validate_shared_page(p_from,p_to,p_limit,p_offset);
 managed:=public.is_store_admin(p_store_id);
 shared:=public.can_read_other_attendance(p_store_id);
 RETURN QUERY SELECT r.employee_id,e.name,r.kind,r.requested_time,
   coalesce(p.work_date,(r.requested_time AT TIME ZONE 'Asia/Seoul')::date),r.status
 FROM public.attendance_correction_requests r JOIN public.employees e ON e.id=r.employee_id AND e.store_id=r.store_id
 LEFT JOIN public.attendance_punches p ON p.id=r.target_punch_id AND p.employee_id=r.employee_id AND p.store_id=r.store_id
 WHERE r.store_id=p_store_id AND coalesce(p.work_date,(r.requested_time AT TIME ZONE 'Asia/Seoul')::date) BETWEEN p_from AND p_to
   AND (managed OR e.user_id=auth.uid() OR (shared AND e.is_active AND e.user_id IS NOT NULL)) ORDER BY r.created_at,r.id LIMIT p_limit OFFSET p_offset;
END $$;
CREATE OR REPLACE FUNCTION public.get_shared_payroll(p_store_id uuid,p_year_month text,p_limit integer DEFAULT 200,p_offset integer DEFAULT 0)
RETURNS TABLE(employee_id uuid,employee_name text,year_month text,gross numeric,applied_hourly_wage numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE shared boolean; managed boolean;
BEGIN
 PERFORM private.assert_store_visibility_access(p_store_id);
 IF p_year_month IS NULL OR p_year_month !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'SHARED_QUERY_INVALID'; END IF;
 PERFORM private.validate_shared_page((p_year_month||'-01')::date,(p_year_month||'-01')::date,p_limit,p_offset);
 managed:=public.is_store_admin(p_store_id);
 shared:=public.can_read_other_payroll(p_store_id);
 RETURN QUERY SELECT p.employee_id,e.name,btrim(p.year_month),p.gross,p.applied_hourly_wage
 FROM public.payroll p JOIN public.employees e ON e.id=p.employee_id AND e.store_id=p.store_id
 WHERE p.store_id=p_store_id AND p.year_month=p_year_month AND (managed OR e.user_id=auth.uid() OR (shared AND e.is_active AND e.user_id IS NOT NULL))
 ORDER BY e.id,p.id LIMIT p_limit OFFSET p_offset;
END $$;
-- 현재 기본급/시급과 과거 저장 스냅샷을 구분하고 누락을 현재 값으로 채우지 않는다.
CREATE OR REPLACE FUNCTION public.get_shared_employee_pay(p_store_id uuid,p_limit integer DEFAULT 200,p_offset integer DEFAULT 0)
RETURNS TABLE(employee_id uuid,employee_name text,base_salary numeric,hourly_wage numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE shared boolean; managed boolean;
BEGIN
 PERFORM private.assert_store_visibility_access(p_store_id);
 PERFORM private.validate_shared_page(current_date,current_date,p_limit,p_offset);
 managed:=public.is_store_admin(p_store_id);
 shared:=public.can_read_other_payroll(p_store_id);
 RETURN QUERY SELECT e.id,e.name,e.base_salary,e.hourly_wage FROM public.employees e
 WHERE e.store_id=p_store_id AND (managed OR e.user_id=auth.uid() OR (shared AND e.is_active AND e.user_id IS NOT NULL)) ORDER BY e.id LIMIT p_limit OFFSET p_offset;
END $$;
-- 기존 손익 집계만 반환하며 인건비는 매장 합계, 개인 wage JSON은 제외한다.
CREATE OR REPLACE FUNCTION public.get_shared_financial_summary(p_store_id uuid,p_year_month text)
RETURNS TABLE(store_id uuid,year_month text,revenue numeric,purchase_cost numeric,labor_cost numeric,fixed_expense numeric,variable_expense numeric,operating_profit numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF NOT public.can_read_store_financials(p_store_id) THEN RAISE EXCEPTION 'FINANCIAL_SHARING_DENIED' USING ERRCODE='42501'; END IF;
 IF p_year_month IS NULL OR p_year_month !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'SHARED_QUERY_INVALID'; END IF;
 RETURN QUERY SELECT f.store_id,f.year_month,f.revenue,f.purchase_cost,f.labor_cost,f.fixed_expense,f.variable_expense,f.operating_profit
 FROM public.get_financial_summaries_v2(ARRAY[p_store_id],ARRAY[p_year_month],false) f;
END $$;
-- 개인 원문 배열을 반환하는 기존 API는 관리 전용이다. 가드가 없으면 적용을 멈춘다.
DO $labor$ BEGIN
 IF position('is_store_admin' IN pg_get_functiondef('public.get_daily_labor_sources(uuid,text)'::regprocedure))=0
 OR position('DAILY_LABOR_FORBIDDEN' IN pg_get_functiondef('public.get_daily_labor_sources(uuid,text)'::regprocedure))=0
 THEN RAISE EXCEPTION 'DAILY_LABOR_GUARD_MISSING'; END IF;
END $labor$;
REVOKE ALL ON FUNCTION private.can_read_shared_domain(uuid,text),private.assert_store_visibility_access(uuid),
 private.validate_shared_page(date,date,integer,integer),public.guard_store_visibility_owner() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.can_read_employee(uuid,uuid),public.can_read_store_financials(uuid),public.can_read_other_attendance(uuid),
 public.can_read_other_payroll(uuid),public.get_my_store_visibility(uuid),public.set_store_visibility(uuid,text,text,text,bigint),
 public.set_store_financial_sharing(uuid,text),public.get_shared_attendance(uuid,date,date,integer,integer),
 public.get_shared_attendance_requests(uuid,date,date,integer,integer),public.get_shared_payroll(uuid,text,integer,integer),
 public.get_shared_employee_pay(uuid,integer,integer),public.get_shared_financial_summary(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_read_employee(uuid,uuid),public.can_read_store_financials(uuid),public.can_read_other_attendance(uuid),
 public.can_read_other_payroll(uuid),public.get_my_store_visibility(uuid),public.set_store_visibility(uuid,text,text,text,bigint),
 public.set_store_financial_sharing(uuid,text),public.get_shared_attendance(uuid,date,date,integer,integer),
 public.get_shared_attendance_requests(uuid,date,date,integer,integer),public.get_shared_payroll(uuid,text,integer,integer),
 public.get_shared_employee_pay(uuid,integer,integer),public.get_shared_financial_summary(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
