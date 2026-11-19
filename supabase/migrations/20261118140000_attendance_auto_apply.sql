-- QR 퇴근 -> 관리자 확인 없이 일별 인건비 자동 반영 / 사용자 확정 2026-11-18.
-- 선행: 20261118120000(원격 적용됨, 수정 금지) -> 20261118130000 -> 이 파일.
-- 원격 미적용. 전체 트랜잭션; 실패 ROLLBACK. 적용 후 복구는 새 보정으로 함수/감사 정책 복원.
-- 과거 월 명세/공제 금액을 덮지 않는다. 자동 일별 반영과 월 명세 작성/정산 확정은 별개.
BEGIN;
ALTER TABLE public.payroll_daily_work ADD COLUMN record_source text NOT NULL DEFAULT 'manual'
 CHECK(record_source IN ('manual','qr_auto'));
ALTER TABLE public.payroll_daily_work ADD COLUMN auto_applied_at timestamptz;
COMMENT ON COLUMN public.payroll_daily_work.record_source IS 'qr_auto: 서버가 출퇴근 원본으로 자동 반영. reviewed_by=NULL은 사람의 승인을 받았다는 뜻이 아님';
COMMENT ON COLUMN public.payroll_daily_work.auto_applied_at IS '성공한 자동 반영 시각. 실패/원본 제거 시 NULL. 전후 값은 기존 daily_work_history에 보존';
CREATE TABLE private.attendance_auto_write_permits (
 transaction_id bigint NOT NULL,employee_id uuid NOT NULL,work_date date NOT NULL,expected jsonb NOT NULL,
 PRIMARY KEY(transaction_id,employee_id,work_date)
);
ALTER TABLE private.attendance_auto_write_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.attendance_auto_write_permits FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.consume_attendance_auto_write_permit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 DELETE FROM private.attendance_auto_write_permits WHERE transaction_id=txid_current()
  AND employee_id=NEW.employee_id AND work_date=NEW.work_date;
 RETURN NEW;
END $$;
-- AFTER: INSERT ON CONFLICT invokes both BEFORE INSERT/UPDATE. The permit must survive until the actual write.
CREATE TRIGGER consume_attendance_auto_write_permit AFTER INSERT OR UPDATE ON public.payroll_daily_work
 FOR EACH ROW EXECUTE FUNCTION private.consume_attendance_auto_write_permit();
CREATE OR REPLACE FUNCTION private.guard_manager_self_attendance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE row_data jsonb; sid uuid; eid uuid;
BEGIN
 IF TG_TABLE_NAME='payroll_daily_work' AND TG_OP<>'DELETE' THEN
  IF NEW.status='approved' AND NEW.record_source='qr_auto' AND NEW.auto_applied_at IS NOT NULL
   AND EXISTS(SELECT 1 FROM private.attendance_auto_write_permits p WHERE p.transaction_id=txid_current()
    AND p.employee_id=NEW.employee_id AND p.work_date=NEW.work_date AND to_jsonb(NEW) @> p.expected)
   THEN RETURN NEW; END IF;
 END IF;
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
CREATE OR REPLACE FUNCTION private.refresh_attendance_daily_work(p_employee_id uuid,p_work_dates date[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE emp public.employees; o public.attendance_punches; i public.attendance_punches;
 d record; sources jsonb; prior private.attendance_work_sync; old_day public.payroll_daily_work;
 saved public.payroll_daily_work; minutes integer; rate numeric; problem text; unpaired boolean;
BEGIN
 SELECT * INTO emp FROM public.employees WHERE id=p_employee_id;
 IF emp.id IS NULL OR emp.employment_type<>'part_time' THEN RETURN; END IF;
 UPDATE private.attendance_work_shifts SET active=false WHERE employee_id=emp.id AND work_date=ANY(p_work_dates) AND active;
 FOR o IN SELECT p.* FROM public.attendance_effective_punches p WHERE p.employee_id=emp.id AND p.work_date=ANY(p_work_dates) AND p.kind='clock_out'
 LOOP
  i:=public.attendance_shift_partner(o.id);
  IF i.id IS NULL OR i.kind<>'clock_in' OR o.punched_at<i.punched_at THEN CONTINUE; END IF;
  -- Explicit approved correction pairs may exceed 16h; the day limit below still applies.
  INSERT INTO private.attendance_work_shifts(clock_out_id,clock_in_id,employee_id,store_id,work_date,elapsed_minutes)
  VALUES(o.id,i.id,emp.id,emp.store_id,i.work_date,floor(extract(epoch FROM o.punched_at-i.punched_at)/60)::integer)
  ON CONFLICT(clock_out_id) DO UPDATE SET clock_in_id=excluded.clock_in_id,work_date=excluded.work_date,
   elapsed_minutes=excluded.elapsed_minutes,active=true;
 END LOOP;
 FOR d IN SELECT DISTINCT x AS work_date FROM unnest(p_work_dates) x WHERE x IS NOT NULL
 LOOP
  SELECT coalesce(jsonb_agg(jsonb_build_object('clock_out_id',clock_out_id,'clock_in_id',clock_in_id,'minutes',elapsed_minutes)
   ORDER BY clock_out_id),'[]'::jsonb),sum(elapsed_minutes)::integer INTO sources,minutes
   FROM private.attendance_work_shifts WHERE employee_id=emp.id AND work_date=d.work_date AND active;
  SELECT * INTO prior FROM private.attendance_work_sync WHERE employee_id=emp.id AND work_date=d.work_date;
  SELECT EXISTS(SELECT 1 FROM public.attendance_effective_punches p WHERE p.employee_id=emp.id
   AND p.work_date=d.work_date AND p.kind='clock_out' AND NOT EXISTS(SELECT 1 FROM private.attendance_work_shifts sh
    WHERE sh.clock_out_id=p.id AND sh.active)) INTO unpaired;
  IF prior.source_snapshot=sources AND prior.state='completed' AND NOT unpaired
   AND (sources='[]'::jsonb OR EXISTS(SELECT 1 FROM public.payroll_daily_work w WHERE w.id=prior.daily_work_id
    AND w.status='approved' AND w.record_source='qr_auto')) THEN CONTINUE; END IF;
  IF sources='[]'::jsonb AND prior.employee_id IS NULL AND NOT unpaired THEN CONTINUE; END IF;
  -- Invalidate settlement even if rate/day-bound validation fails. Monthly gross/snapshot stay historical.
  UPDATE public.payroll SET is_settled=false,settled_at=NULL
   WHERE employee_id=emp.id AND year_month=to_char(d.work_date,'YYYY-MM') AND is_settled;
  problem:=NULL; saved:=NULL;
  BEGIN
   IF unpaired THEN RAISE EXCEPTION 'ATTENDANCE_WORK_PAIR_REQUIRED'; END IF;
   IF sources='[]'::jsonb THEN
    -- A correction moved/voided the last pair: retain the old audited value, exclude it from future monthly sources.
    UPDATE public.payroll_daily_work SET status='pending',reviewed_by=NULL,review_note=NULL,auto_applied_at=NULL,
     revision=revision+1,updated_at=clock_timestamp() WHERE employee_id=emp.id AND work_date=d.work_date;
    INSERT INTO private.attendance_work_sync(employee_id,store_id,work_date,state,error_code,source_snapshot,daily_work_id)
     VALUES(emp.id,emp.store_id,d.work_date,'completed','ATTENDANCE_WORK_SOURCE_REMOVED',sources,NULL)
     ON CONFLICT(employee_id,work_date) DO UPDATE SET state='completed',error_code=excluded.error_code,
      source_snapshot=excluded.source_snapshot,daily_work_id=NULL,updated_at=clock_timestamp();
    CONTINUE;
   END IF;
   IF minutes>1440 THEN RAISE EXCEPTION 'ATTENDANCE_WORK_DAY_LIMIT'; END IF;
   IF emp.joined_at IS NULL OR d.work_date<emp.joined_at THEN RAISE EXCEPTION 'ATTENDANCE_WORK_DATE_INVALID'; END IF;
   SELECT * INTO old_day FROM public.payroll_daily_work WHERE employee_id=emp.id AND work_date=d.work_date FOR UPDATE;
   rate:=old_day.applied_hourly_wage;
   IF rate IS NULL THEN
    SELECT hourly_wage INTO rate FROM public.employee_wage_history WHERE employee_id=emp.id AND store_id=emp.store_id
     AND effective_date<=d.work_date ORDER BY effective_date DESC,created_at DESC,id DESC LIMIT 1;
    IF rate IS NULL THEN
     SELECT hourly_wage INTO rate FROM public.employee_wage_history WHERE employee_id=emp.id AND store_id=emp.store_id
      ORDER BY effective_date,created_at DESC,id DESC LIMIT 1;
    END IF;
    IF rate IS NULL AND NOT EXISTS(SELECT 1 FROM public.employee_wage_history WHERE employee_id=emp.id AND store_id=emp.store_id)
     THEN rate:=emp.hourly_wage; END IF;
   END IF;
   IF rate IS NULL OR rate<=0 OR rate>=100000000 OR rate::text IN ('NaN','Infinity','-Infinity')
    THEN RAISE EXCEPTION 'DAILY_WORK_RATE_REQUIRED'; END IF;
   -- Only this source-validated server function can mint a one-statement automatic-write permit.
   INSERT INTO private.attendance_auto_write_permits(transaction_id,employee_id,work_date,expected)
   VALUES(txid_current(),emp.id,d.work_date,jsonb_build_object('store_id',emp.store_id,'employee_id',emp.id,
    'work_date',d.work_date,'worked_minutes',minutes,'applied_hourly_wage',rate,'gross',round(minutes*rate/60),
    'note','QR 출퇴근 자동 반영','status','approved','submitted_by',NULL,'reviewed_by',NULL,'review_note',NULL,
    'record_source','qr_auto'));
   INSERT INTO public.payroll_daily_work(store_id,employee_id,work_date,worked_minutes,applied_hourly_wage,gross,note,status,
    submitted_by,reviewed_by,review_note,record_source,auto_applied_at)
   VALUES(emp.store_id,emp.id,d.work_date,minutes,rate,round(minutes*rate/60),'QR 출퇴근 자동 반영','approved',NULL,NULL,NULL,'qr_auto',clock_timestamp())
   ON CONFLICT(employee_id,work_date) DO UPDATE SET worked_minutes=excluded.worked_minutes,gross=excluded.gross,
    status='approved',note=excluded.note,revision=payroll_daily_work.revision+1,submitted_by=NULL,reviewed_by=NULL,
    review_note=NULL,record_source='qr_auto',auto_applied_at=excluded.auto_applied_at,updated_at=clock_timestamp() RETURNING * INTO saved;
  EXCEPTION WHEN OTHERS THEN
   -- Persist stable public code only; never return SQL text or sensitive values.
   problem:=CASE WHEN SQLERRM IN ('ATTENDANCE_WORK_PAIR_REQUIRED','ATTENDANCE_WORK_DAY_LIMIT',
    'ATTENDANCE_WORK_DATE_INVALID','DAILY_WORK_RATE_REQUIRED') THEN SQLERRM ELSE 'ATTENDANCE_WORK_WRITE_FAILED' END;
  END;
  IF problem IS NOT NULL THEN
   -- A stale approved amount must not remain eligible for payroll after a failed recalculation.
   UPDATE public.payroll_daily_work SET status='pending',reviewed_by=NULL,review_note=NULL,auto_applied_at=NULL,
    revision=revision+1,updated_at=clock_timestamp() WHERE employee_id=emp.id AND work_date=d.work_date AND status<>'pending';
  END IF;
  INSERT INTO private.attendance_work_sync(employee_id,store_id,work_date,state,error_code,source_snapshot,daily_work_id)
  VALUES(emp.id,emp.store_id,d.work_date,CASE WHEN problem IS NULL THEN 'completed' ELSE 'failed' END,problem,sources,saved.id)
  ON CONFLICT(employee_id,work_date) DO UPDATE SET state=excluded.state,error_code=excluded.error_code,
   source_snapshot=excluded.source_snapshot,daily_work_id=excluded.daily_work_id,updated_at=clock_timestamp();
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.guard_attendance_work_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='payroll_daily_work' THEN
  IF NEW.status='approved' AND EXISTS(SELECT 1 FROM private.attendance_auto_write_permits p
   WHERE p.transaction_id=txid_current() AND p.employee_id=NEW.employee_id AND p.work_date=NEW.work_date
    AND to_jsonb(NEW) @> p.expected) THEN RETURN NEW; END IF;
  IF NEW.status='approved' AND EXISTS(SELECT 1 FROM private.attendance_work_sync s
   WHERE s.employee_id=NEW.employee_id AND s.work_date=NEW.work_date AND (s.state<>'completed' OR s.source_snapshot='[]'::jsonb))
   THEN RAISE EXCEPTION 'ATTENDANCE_WORK_RECALC_REQUIRED'; END IF;
 ELSE
  IF (NEW.is_settled OR (TG_OP='INSERT' AND NEW.daily_work_snapshot IS NOT NULL)
    OR (TG_OP='UPDATE' AND NEW.daily_work_snapshot IS DISTINCT FROM OLD.daily_work_snapshot))
   AND EXISTS(SELECT 1 FROM private.attendance_work_sync s WHERE s.employee_id=NEW.employee_id
    AND to_char(s.work_date,'YYYY-MM')=NEW.year_month AND s.state<>'completed')
   THEN RAISE EXCEPTION 'ATTENDANCE_WORK_RECALC_REQUIRED'; END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE INDEX attendance_work_sync_admin_issues ON private.attendance_work_sync(store_id,work_date) WHERE state='failed';

-- 관리자 전용 확인 필요 목록. 직원의 별도 제출/확인 단계가 아니다.
CREATE FUNCTION public.get_admin_attendance_work_issues(p_store_id uuid,p_from date,p_to date)
RETURNS TABLE(employee_id uuid,employee_name text,work_date date,error_code text,updated_at timestamptz,retry_punch_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_store_admin(p_store_id),false) THEN
  RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to-p_from>366 THEN RAISE EXCEPTION 'ATTENDANCE_INPUT_INVALID'; END IF;
 -- Resolve an effective checkout, never a superseded/voided version. A shift's date
 -- is its clock-in date, which may differ from the checkout's date after midnight.
 RETURN QUERY SELECT s.employee_id,e.name,s.work_date,s.error_code,s.updated_at,retry.id
  FROM private.attendance_work_sync s
  JOIN public.employees e ON e.id=s.employee_id AND e.store_id=s.store_id
  LEFT JOIN LATERAL (
   SELECT p.id FROM public.attendance_effective_punches p
   WHERE p.employee_id=s.employee_id AND p.store_id=s.store_id AND p.kind='clock_out'
    AND (p.work_date=s.work_date OR EXISTS(SELECT 1 FROM private.attendance_work_shifts sh
     WHERE sh.clock_out_id=p.id AND sh.employee_id=s.employee_id AND sh.store_id=s.store_id
      AND sh.work_date=s.work_date AND sh.active))
   ORDER BY p.punched_at DESC,p.id DESC LIMIT 1
  ) retry ON true
  WHERE s.store_id=p_store_id AND s.work_date BETWEEN p_from AND p_to AND s.state='failed'
  ORDER BY s.work_date,s.employee_id LIMIT 1000;
END $$;
REVOKE ALL ON FUNCTION private.consume_attendance_auto_write_permit(),public.get_admin_attendance_work_issues(uuid,date,date)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_attendance_work_issues(uuid,date,date) TO authenticated;

-- Upgrade only recorded successful QR sources. Keep rate snapshots and audit every transition.
DO $$DECLARE e record; dates date[]; BEGIN
 FOR e IN SELECT DISTINCT employee_id FROM private.attendance_work_sync WHERE state='completed' AND source_snapshot<>'[]'::jsonb ORDER BY employee_id LOOP
  PERFORM 1 FROM public.employees WHERE id=e.employee_id FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance_punch:'||e.employee_id::text,0));
  SELECT array_agg(work_date ORDER BY work_date) INTO dates FROM private.attendance_work_sync
   WHERE employee_id=e.employee_id AND state='completed' AND source_snapshot<>'[]'::jsonb;
  PERFORM private.refresh_attendance_daily_work(e.employee_id,dates);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
