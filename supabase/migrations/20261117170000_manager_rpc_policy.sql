-- 역할 모델 3단계: owner/manager 운영 권한 및 자기 근태 보호.
-- 선행: hardening → policy → role_model_core → store_visibility.
-- 적용/복구: BEGIN 전체 원자 적용. 실패 시 ROLLBACK; 커밋 후에는 새 보정 migration.
-- 원본 근태/스케줄/급여/QR snapshot을 이전·분할·초기화하지 않는다.
BEGIN;
CREATE OR REPLACE FUNCTION public.attendance_can_review_employee(p_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.employees e
 WHERE e.id=p_employee_id AND e.is_active AND
 (public.is_store_owner(e.store_id) OR
 (public.is_store_manager(e.store_id) AND e.user_id IS DISTINCT FROM auth.uid())));
$$;

CREATE OR REPLACE FUNCTION public.can_manage_recipes(sid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT public.is_store_admin(sid) OR
 (public.is_store_member(sid) AND NOT public.is_store_part_timer(sid));
$$;

-- Row-bound helper: preserves own employee access but excludes manager self moderation.
CREATE OR REPLACE FUNCTION public.can_manage_employee_attendance(p_store_id uuid,p_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.employees e
 WHERE e.id=p_employee_id AND e.store_id=p_store_id AND
 (public.is_store_owner(p_store_id) OR
 (public.is_store_manager(p_store_id) AND e.user_id IS DISTINCT FROM auth.uid())));
$$;

-- M5: one exact supersession may be authorized by the validated submission RPC.
-- Private, transaction-bound and consumed by its trigger; no GUC/call-stack bypass.
CREATE TABLE IF NOT EXISTS private.work_submission_supersessions (
 transaction_id bigint NOT NULL,
 submission_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 PRIMARY KEY(transaction_id,submission_id,actor_id)
);
ALTER TABLE private.work_submission_supersessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.work_submission_supersessions FROM PUBLIC,anon,authenticated,service_role;

-- Trigger also protects SECURITY DEFINER writes, and OLD/NEW targets on reassignment.
CREATE OR REPLACE FUNCTION private.guard_manager_self_attendance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE row_data jsonb; sid uuid; eid uuid;
BEGIN
 IF TG_TABLE_NAME='payroll_work_submissions' AND TG_OP='UPDATE' THEN
  IF to_jsonb(OLD)->>'status'='pending' AND to_jsonb(NEW)->>'status'='superseded'
   AND (to_jsonb(NEW)-'status')=(to_jsonb(OLD)-'status') THEN
   DELETE FROM private.work_submission_supersessions
    WHERE transaction_id=txid_current() AND submission_id=OLD.id AND actor_id=auth.uid();
   IF FOUND THEN RETURN NEW; END IF;
  END IF;
 END IF;
 FOR row_data IN SELECT x FROM unnest(ARRAY[
 CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,
 CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END]) x WHERE x IS NOT NULL LOOP
  sid:=(row_data->>'store_id')::uuid;
  eid:=CASE WHEN TG_TABLE_NAME='employees' THEN (row_data->>'id')::uuid ELSE (row_data->>'employee_id')::uuid END;
  IF public.is_store_manager(sid) AND NOT public.is_store_owner(sid)
   AND EXISTS(SELECT 1 FROM public.employees e WHERE e.id=eid AND e.store_id=sid AND e.user_id=auth.uid()) THEN
   IF TG_TABLE_NAME IN ('schedule_requests','attendance_corrections','payroll_work_submissions','payroll_daily_work')
    AND TG_OP<>'DELETE' AND to_jsonb(NEW)->>'status'='pending'
    AND to_jsonb(NEW)->>'reviewed_by' IS NULL AND to_jsonb(NEW)->>'reviewed_at' IS NULL
    AND to_jsonb(NEW)->>'review_note' IS NULL
    AND (TG_OP='INSERT' OR to_jsonb(OLD)->>'status' IS NOT DISTINCT FROM to_jsonb(NEW)->>'status' OR TG_TABLE_NAME='payroll_daily_work') THEN
     CONTINUE; -- submitting own pending work/request remains allowed, never self review.
   END IF;
   RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501';
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['attendance','employee_schedules','attendance_corrections','schedule_requests','payroll_work_submissions','payroll_daily_work'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS manager_self_attendance_guard ON public.%I',t);
  EXECUTE format('CREATE TRIGGER manager_self_attendance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.guard_manager_self_attendance()',t);
 END LOOP;
END $$;

-- Restrictive policies clamp historical permissive FOR ALL policies without opening reads.
DO $$DECLARE t text; op text; BEGIN
 FOREACH t IN ARRAY ARRAY['attendance','employee_schedules','attendance_corrections','schedule_requests'] LOOP
  FOREACH op IN ARRAY ARRAY['UPDATE','DELETE'] LOOP
   EXECUTE format('DROP POLICY IF EXISTS manager_target_%s ON public.%I',lower(op),t);
   EXECUTE format('CREATE POLICY manager_target_%s ON public.%I AS RESTRICTIVE FOR %s TO authenticated USING(public.can_manage_employee_attendance(store_id,employee_id)) %s',
    lower(op),t,op,CASE WHEN op='UPDATE' THEN 'WITH CHECK(public.can_manage_employee_attendance(store_id,employee_id))' ELSE '' END);
  END LOOP;
 END LOOP;
END $$;
-- Legacy attendance INSERT is manual recording, not a QR scan. No self-entry fallback.
DROP POLICY IF EXISTS attendance_insert_self ON public.attendance;
CREATE POLICY attendance_insert_self ON public.attendance FOR INSERT TO authenticated
WITH CHECK(public.can_manage_employee_attendance(store_id,employee_id));
DROP POLICY IF EXISTS manager_target_insert ON public.attendance;
CREATE POLICY manager_target_insert ON public.attendance AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK(public.can_manage_employee_attendance(store_id,employee_id));
-- A self request is pending only and is bound to its actual employee/store.
DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['schedule_requests','attendance_corrections'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS manager_request_insert ON public.%I',t);
  EXECUTE format('CREATE POLICY manager_request_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(public.can_manage_employee_attendance(store_id,employee_id) OR (status=''pending'' AND reviewed_by IS NULL AND reviewed_at IS NULL AND EXISTS(SELECT 1 FROM public.employees e WHERE e.id=employee_id AND e.store_id=%I.store_id AND e.user_id=auth.uid())))',t,t);
 END LOOP;
END $$;
-- Schedule direct INSERT is management, never a self request.
DROP POLICY IF EXISTS manager_target_insert ON public.employee_schedules;
CREATE POLICY manager_target_insert ON public.employee_schedules AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK(public.can_manage_employee_attendance(store_id,employee_id));

CREATE OR REPLACE FUNCTION public.save_daily_work(p_employee_id uuid,p_work_date date,p_minutes integer,p_note text,p_revision integer DEFAULT NULL)
RETURNS public.payroll_daily_work LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE e public.employees; old_row public.payroll_daily_work; saved public.payroll_daily_work; rate numeric; admin boolean;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=p_employee_id FOR UPDATE;
 admin:=public.can_manage_employee_attendance(e.store_id,e.id);
 -- A manager may submit own minutes, but remains pending for owner review.

 IF auth.uid() IS NULL OR e.id IS NULL OR NOT e.is_active OR e.employment_type<>'part_time'
 OR NOT public.is_store_member(e.store_id) OR (NOT admin AND e.user_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'DAILY_WORK_FORBIDDEN'; END IF;
 IF p_work_date IS NULL OR p_work_date>(now() AT TIME ZONE 'Asia/Seoul')::date OR e.joined_at IS NULL OR p_work_date<e.joined_at
 OR p_minutes IS NULL OR p_minutes NOT BETWEEN 0 AND 1440 OR length(btrim(coalesce(p_note,''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'DAILY_WORK_INVALID'; END IF;
 SELECT * INTO old_row FROM public.payroll_daily_work WHERE employee_id=e.id AND work_date=p_work_date FOR UPDATE;
 IF old_row.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'DAILY_WORK_CHANGED'; END IF;
 -- Existing date's rate is an immutable snapshot even when minutes are corrected.
 rate:=old_row.applied_hourly_wage;
 IF rate IS NULL THEN
   SELECT hourly_wage INTO rate FROM public.employee_wage_history WHERE employee_id=e.id AND store_id=e.store_id AND effective_date<=p_work_date
     ORDER BY effective_date DESC,created_at DESC,id DESC LIMIT 1;
   IF rate IS NULL THEN SELECT hourly_wage INTO rate FROM public.employee_wage_history WHERE employee_id=e.id AND store_id=e.store_id ORDER BY effective_date,created_at DESC,id DESC LIMIT 1; END IF;
   IF rate IS NULL AND NOT EXISTS(SELECT 1 FROM public.employee_wage_history WHERE employee_id=e.id AND store_id=e.store_id) THEN rate:=e.hourly_wage; END IF;
 END IF;
 IF rate IS NULL OR rate<=0 OR rate>=100000000 OR rate::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'DAILY_WORK_RATE_REQUIRED'; END IF;
 INSERT INTO public.payroll_daily_work(store_id,employee_id,work_date,worked_minutes,applied_hourly_wage,gross,note,status,revision,submitted_by,reviewed_by)
 VALUES(e.store_id,e.id,p_work_date,p_minutes,rate,round(p_minutes*rate/60),btrim(p_note),CASE WHEN admin THEN 'approved' ELSE 'pending' END,1,auth.uid(),CASE WHEN admin THEN auth.uid() ELSE NULL END)
 ON CONFLICT(employee_id,work_date) DO UPDATE SET worked_minutes=excluded.worked_minutes,gross=excluded.gross,note=excluded.note,status=excluded.status,
 revision=payroll_daily_work.revision+1,submitted_by=excluded.submitted_by,reviewed_by=excluded.reviewed_by,review_note=NULL,updated_at=now() RETURNING * INTO saved;
 UPDATE public.payroll SET is_settled=false,settled_at=NULL WHERE employee_id=e.id AND year_month=to_char(p_work_date,'YYYY-MM') AND is_settled;
 RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.review_daily_work(p_id uuid,p_revision integer,p_status text,p_note text DEFAULT '')
RETURNS public.payroll_daily_work LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE target uuid; saved public.payroll_daily_work;
BEGIN
 SELECT employee_id INTO target FROM public.payroll_daily_work WHERE id=p_id;
 PERFORM 1 FROM public.employees WHERE id=target FOR UPDATE;
 SELECT * INTO saved FROM public.payroll_daily_work WHERE id=p_id FOR UPDATE;
 IF auth.uid() IS NULL OR saved.id IS NULL OR NOT public.can_manage_employee_attendance(saved.store_id,saved.employee_id) THEN RAISE EXCEPTION 'DAILY_WORK_FORBIDDEN'; END IF;
 IF saved.revision IS DISTINCT FROM p_revision OR saved.status<>'pending' THEN RAISE EXCEPTION 'DAILY_WORK_CHANGED'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('approved','rejected') OR length(coalesce(p_note,''))>1000 OR (p_status='rejected' AND btrim(coalesce(p_note,''))='') THEN RAISE EXCEPTION 'DAILY_WORK_INVALID'; END IF;
 UPDATE public.payroll_daily_work SET status=p_status,review_note=btrim(coalesce(p_note,'')),reviewed_by=auth.uid(),revision=revision+1,updated_at=now() WHERE id=p_id RETURNING * INTO saved;
 UPDATE public.payroll SET is_settled=false,settled_at=NULL WHERE employee_id=saved.employee_id AND year_month=to_char(saved.work_date,'YYYY-MM') AND is_settled;
 RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.submit_work_minutes(p_employee_id uuid, p_year_month text, p_minutes integer, p_note text, p_previous_id uuid DEFAULT NULL)
RETURNS public.payroll_work_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public,private,pg_temp AS $$
DECLARE emp public.employees; latest public.payroll_work_submissions; saved public.payroll_work_submissions; max_minutes integer;
BEGIN
  SELECT * INTO emp FROM public.employees WHERE id = p_employee_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR emp.user_id IS DISTINCT FROM auth.uid() OR NOT emp.is_active
    OR emp.employment_type <> 'part_time' OR NOT public.is_store_member(emp.store_id) THEN
    RAISE EXCEPTION '연결된 본인 파트타이머 계정으로만 제출할 수 있습니다';
  END IF;
  IF p_year_month IS NULL OR p_year_month !~ '^\d{4}-(0[1-9]|1[0-2])$'
    OR p_year_month > to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') THEN RAISE EXCEPTION '대상 월을 확인해주세요'; END IF;
  max_minutes := extract(day FROM (p_year_month || '-01')::date + interval '1 month - 1 day')::integer * 1440;
  IF p_minutes IS NULL OR p_minutes < 0 OR p_minutes > max_minutes THEN RAISE EXCEPTION '총 근무 분을 확인해주세요'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION '입력 근거를 1~1000자로 작성해주세요'; END IF;
  SELECT * INTO latest FROM public.payroll_work_submissions WHERE employee_id = emp.id AND year_month = p_year_month ORDER BY version DESC LIMIT 1;
  IF latest.id IS DISTINCT FROM p_previous_id THEN RAISE EXCEPTION '제출 내역이 변경됐습니다. 새로고침해주세요'; END IF;
  IF latest.status = 'pending' THEN
    IF public.is_store_manager(emp.store_id) AND NOT public.is_store_owner(emp.store_id) THEN
      INSERT INTO private.work_submission_supersessions(transaction_id,submission_id,actor_id)
        VALUES(txid_current(),latest.id,auth.uid());
    END IF;
    UPDATE public.payroll_work_submissions SET status = 'superseded' WHERE id = latest.id;
  END IF;
  INSERT INTO public.payroll_work_submissions(store_id,employee_id,year_month,worked_minutes,note,version,status,submitted_by)
    VALUES(emp.store_id,emp.id,p_year_month,p_minutes,btrim(p_note),coalesce(latest.version,0)+1,'pending',auth.uid()) RETURNING * INTO saved;
  -- 재제출된 시간은 승인 전까지 급여 금액에 반영하지 않는다. 기존 정산 확정만 해제한다.
  UPDATE public.payroll SET is_settled = false, settled_at = NULL WHERE employee_id = emp.id AND year_month = p_year_month AND is_settled;
  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_work_minutes(p_submission_id uuid, p_status text, p_note text DEFAULT '')
RETURNS public.payroll_work_submissions LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public,private,pg_temp AS $$
DECLARE saved public.payroll_work_submissions; target_employee uuid;
BEGIN
  SELECT employee_id INTO target_employee FROM public.payroll_work_submissions WHERE id = p_submission_id;
  PERFORM 1 FROM public.employees WHERE id = target_employee FOR UPDATE;
  SELECT * INTO saved FROM public.payroll_work_submissions WHERE id = p_submission_id FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT public.can_manage_employee_attendance(saved.store_id,saved.employee_id) THEN RAISE EXCEPTION '관리자만 확인할 수 있습니다'; END IF;
  IF saved.status <> 'pending' OR EXISTS (SELECT 1 FROM public.payroll_work_submissions s WHERE s.employee_id = saved.employee_id AND s.year_month = saved.year_month AND s.version > saved.version)
    THEN RAISE EXCEPTION '최신 제출 내역을 새로고침해주세요'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('approved','rejected') THEN RAISE EXCEPTION '확인 상태를 선택해주세요'; END IF;
  IF length(coalesce(p_note,'')) > 1000 OR (p_status = 'rejected' AND length(btrim(coalesce(p_note,''))) = 0) THEN RAISE EXCEPTION '반려 사유를 1~1000자로 작성해주세요'; END IF;
  UPDATE public.payroll_work_submissions SET status=p_status,reviewed_by=auth.uid(),reviewed_at=now(),review_note=btrim(coalesce(p_note,'')) WHERE id=saved.id RETURNING * INTO saved;
  RETURN saved;
END;
$$;

-- Payroll source overrides must not bypass own attendance review.
CREATE OR REPLACE FUNCTION private.guard_manager_self_payroll_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE r jsonb; old_source jsonb; new_source jsonb;
BEGIN
 FOR r IN SELECT x FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,to_jsonb(NEW)]) x WHERE x IS NOT NULL LOOP
  IF public.is_store_manager((r->>'store_id')::uuid) AND NOT public.is_store_owner((r->>'store_id')::uuid)
   AND EXISTS(SELECT 1 FROM public.employees e WHERE e.id=(r->>'employee_id')::uuid AND e.user_id=auth.uid()) THEN
   new_source:=jsonb_build_array(NEW.worked_minutes,NEW.work_submission_id,NEW.daily_work_snapshot);
   IF TG_OP='UPDATE' THEN
    old_source:=jsonb_build_array(OLD.worked_minutes,OLD.work_submission_id,OLD.daily_work_snapshot);
   ELSE old_source:='[null,null,null]'::jsonb; END IF;
   IF new_source IS DISTINCT FROM old_source THEN RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS manager_self_payroll_source_guard ON public.payroll;
CREATE TRIGGER manager_self_payroll_source_guard BEFORE INSERT OR UPDATE ON public.payroll
FOR EACH ROW EXECUTE FUNCTION private.guard_manager_self_payroll_source();
REVOKE ALL ON FUNCTION private.guard_manager_self_payroll_source() FROM PUBLIC,anon,authenticated,service_role;

REVOKE ALL ON FUNCTION public.submit_work_minutes(uuid,text,integer,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.submit_work_minutes(uuid,text,integer,text,uuid) TO authenticated;

-- Public API ACLs are explicit; existing QR internal helper stays non-callable.
REVOKE ALL ON FUNCTION public.attendance_can_review_employee(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.guard_manager_self_attendance() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.can_manage_employee_attendance(uuid,uuid),public.can_manage_recipes(uuid),
 public.save_daily_work(uuid,date,integer,text,integer),public.review_daily_work(uuid,integer,text,text),
 public.review_work_minutes(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_employee_attendance(uuid,uuid),public.can_manage_recipes(uuid),
 public.save_daily_work(uuid,date,integer,text,integer),public.review_daily_work(uuid,integer,text,text),
 public.review_work_minutes(uuid,text,text) TO authenticated;
COMMIT;
