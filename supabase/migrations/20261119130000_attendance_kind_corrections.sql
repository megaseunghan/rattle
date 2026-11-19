-- QR followups: kind correction / QR-A04. Local only, 2026-11-19.
-- Prerequisite: release/qr-perf-20261119 through 20261119120000_release_rls_auth_initplan.sql.
-- Apply whole transaction; failure ROLLBACK, committed recovery uses a new forward migration.
-- Original punches, wage snapshots and monthly slips are preserved. No remote execution here.
BEGIN;
CREATE OR REPLACE FUNCTION private.attendance_lineage_kind_changed(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 WITH RECURSIVE lineage AS (
  SELECT p.id,p.kind,p.supersedes_id FROM public.attendance_punches p WHERE p.id=p_id
  UNION
  SELECT p.id,p.kind,p.supersedes_id FROM public.attendance_punches p JOIN lineage l ON p.id=l.supersedes_id
 ) SELECT EXISTS(SELECT 1 FROM lineage l JOIN public.attendance_punches old ON old.id=l.supersedes_id WHERE old.kind<>l.kind);
$$;
REVOKE ALL ON FUNCTION private.attendance_lineage_kind_changed(uuid) FROM PUBLIC,anon,authenticated,service_role;
-- Preserve the original event's order when a correction keeps an identical timestamp.
CREATE OR REPLACE FUNCTION private.attendance_root_order(p_id uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 WITH RECURSIVE lineage AS (
  SELECT id,supersedes_id,event_order FROM public.attendance_punches WHERE id=p_id
  UNION
  SELECT p.id,p.supersedes_id,p.event_order FROM public.attendance_punches p JOIN lineage l ON p.id=l.supersedes_id
 ) SELECT min(event_order) FROM lineage;
$$;
REVOKE ALL ON FUNCTION private.attendance_root_order(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.attendance_shift_partner(p_target_punch_id uuid)
RETURNS public.attendance_punches LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE target public.attendance_punches; partner public.attendance_punches; linked_id uuid;
BEGIN
  SELECT * INTO target FROM public.attendance_effective_punches WHERE id=p_target_punch_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- 이미 승인한 정정은 명시 이력의 짝을 우선한다(동시각/16시간을 넘도록 늘린 정정도 원래 짝 유지).
  SELECT CASE WHEN r.paired_applied_punch_id=target.id
                    OR (r.applied_punch_id<>target.id AND r.original_snapshot->'paired_original'->>'punch_id'=target.id::text)
              THEN r.applied_punch_id
              ELSE coalesce(r.paired_applied_punch_id,(r.original_snapshot->'paired_before_apply'->>'punch_id')::uuid,
                            (r.original_snapshot->'paired_original'->>'punch_id')::uuid) END INTO linked_id
  FROM public.attendance_correction_requests r
  WHERE r.employee_id=target.employee_id AND r.status='approved'
    AND (r.applied_punch_id=target.id OR r.paired_applied_punch_id=target.id
         OR r.original_snapshot->'paired_original'->>'punch_id'=target.id::text)
  ORDER BY r.reviewed_at DESC,r.id DESC LIMIT 1;
  IF linked_id IS NOT NULL AND NOT private.attendance_lineage_kind_changed(target.id) THEN
    WITH RECURSIVE lineage AS (
      SELECT p.* FROM public.attendance_punches p WHERE p.id=linked_id AND p.employee_id=target.employee_id
      UNION
      SELECT p.* FROM public.attendance_punches p JOIN lineage l ON p.supersedes_id=l.id
    )
    SELECT p.* INTO partner FROM lineage p WHERE NOT p.is_void
      AND NOT EXISTS (SELECT 1 FROM public.attendance_punches c WHERE c.supersedes_id=p.id);
    IF partner.id IS NOT NULL AND partner.kind<>target.kind
       AND NOT private.attendance_lineage_kind_changed(partner.id) THEN RETURN partner; END IF;
  END IF;
  IF target.kind='clock_in' THEN
    SELECT * INTO partner FROM public.attendance_effective_punches p
    WHERE p.employee_id=target.employee_id AND (p.punched_at,private.attendance_root_order(p.id))>(target.punched_at,private.attendance_root_order(target.id))
    ORDER BY p.punched_at,private.attendance_root_order(p.id) LIMIT 1;
    IF partner.kind='clock_out' AND partner.punched_at-target.punched_at <= interval '16 hours' THEN RETURN partner; END IF;
  ELSE
    SELECT * INTO partner FROM public.attendance_effective_punches p
    WHERE p.employee_id=target.employee_id AND (p.punched_at,private.attendance_root_order(p.id))<(target.punched_at,private.attendance_root_order(target.id))
    ORDER BY p.punched_at DESC,private.attendance_root_order(p.id) DESC LIMIT 1;
    IF partner.kind='clock_in' AND target.punched_at-partner.punched_at <= interval '16 hours' THEN RETURN partner; END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.attendance_validate_correction_order(
  p_employee_id uuid, p_action text, p_target_id uuid, p_kind text, p_time timestamptz)
RETURNS public.attendance_punches LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE target public.attendance_punches; adjacent public.attendance_punches; partner public.attendance_punches;
BEGIN
  IF p_action='add' THEN
    IF EXISTS (
      SELECT 1 FROM public.attendance_effective_punches i
      CROSS JOIN LATERAL public.attendance_shift_partner(i.id) o
      WHERE i.employee_id=p_employee_id AND i.kind='clock_in' AND i.punched_at<p_time
        AND o.kind='clock_out' AND o.punched_at>p_time
    ) THEN RAISE EXCEPTION 'ATTENDANCE_ORDER_INVALID'; END IF;
    RETURN NULL;
  END IF;
  IF p_action <> 'change' THEN RETURN NULL; END IF;
  SELECT * INTO target FROM public.attendance_effective_punches WHERE id=p_target_id AND employee_id=p_employee_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_TARGET_INVALID'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('clock_in','clock_out') THEN RAISE EXCEPTION 'ATTENDANCE_INPUT_INVALID'; END IF;
  IF p_kind IS DISTINCT FROM target.kind THEN
    -- A kind change may rebuild adjacent pairs, but cannot jump over another event.
    IF EXISTS (SELECT 1 FROM public.attendance_effective_punches p WHERE p.employee_id=p_employee_id
      AND p.id<>target.id AND ((p.punched_at<target.punched_at AND p.punched_at>p_time)
        OR (p.punched_at>target.punched_at AND p.punched_at<p_time)))
      THEN RAISE EXCEPTION 'ATTENDANCE_ORDER_INVALID'; END IF;
    RETURN NULL;
  END IF;
  partner := public.attendance_shift_partner(target.id);
  IF partner.id IS NOT NULL AND (
      (target.kind='clock_in' AND p_time>partner.punched_at) OR
      (target.kind='clock_out' AND p_time<partner.punched_at)) THEN RAISE EXCEPTION 'ATTENDANCE_ORDER_INVALID'; END IF;
  SELECT * INTO adjacent FROM public.attendance_effective_punches p
  WHERE p.employee_id=p_employee_id AND p.id IS DISTINCT FROM partner.id AND (p.punched_at,private.attendance_root_order(p.id))<(target.punched_at,private.attendance_root_order(target.id))
  ORDER BY p.punched_at DESC,private.attendance_root_order(p.id) DESC LIMIT 1;
  IF adjacent.id IS NOT NULL AND p_time<adjacent.punched_at THEN RAISE EXCEPTION 'ATTENDANCE_ORDER_INVALID'; END IF;
  SELECT * INTO adjacent FROM public.attendance_effective_punches p
  WHERE p.employee_id=p_employee_id AND p.id IS DISTINCT FROM partner.id AND (p.punched_at,private.attendance_root_order(p.id))>(target.punched_at,private.attendance_root_order(target.id))
  ORDER BY p.punched_at,private.attendance_root_order(p.id) LIMIT 1;
  IF adjacent.id IS NOT NULL AND p_time>adjacent.punched_at THEN RAISE EXCEPTION 'ATTENDANCE_ORDER_INVALID'; END IF;
  RETURN partner;
END $$;

CREATE OR REPLACE FUNCTION public.review_attendance_correction(p_request_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); req public.attendance_correction_requests; emp public.employees;
  target public.attendance_punches; saved public.attendance_punches; partner public.attendance_punches; paired_saved uuid; note text;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  -- 직원 DELETE의 cascade보다 요청 행을 먼저 잠그면 employee ↔ request 순환이 된다.
  -- 읽기 조회로 대상을 찾고 직원 KEY SHARE → 요청 FOR UPDATE → 직원 advisory 순서로 잠근다.
  SELECT * INTO req FROM public.attendance_correction_requests WHERE id = p_request_id;
  IF NOT FOUND OR req.status <> 'pending' THEN RAISE EXCEPTION 'ATTENDANCE_CORRECTION_NOT_PENDING'; END IF;
  IF NOT public.is_store_admin(req.store_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
  SELECT * INTO emp FROM public.employees WHERE id=req.employee_id AND store_id=req.store_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_CORRECTION_NOT_PENDING'; END IF;
  SELECT * INTO req FROM public.attendance_correction_requests WHERE id=p_request_id AND employee_id=emp.id FOR UPDATE;
  IF NOT FOUND OR req.status <> 'pending' THEN RAISE EXCEPTION 'ATTENDANCE_CORRECTION_NOT_PENDING'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance_punch:' || emp.id::text, 0));
  IF NOT public.is_store_admin(req.store_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
  IF NOT public.attendance_can_review_employee(req.employee_id) THEN RAISE EXCEPTION 'ATTENDANCE_OWNER_REQUIRED'; END IF;
  IF NOT p_approve THEN
    UPDATE public.attendance_correction_requests SET status = 'rejected', reviewed_by = caller, reviewed_at = now(),
      review_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500) WHERE id = req.id;
    RETURN NULL;
  END IF;
  note := left('정정 승인: ' || req.reason, 500); -- 요청 원문(최대 500자)은 요청 행에 그대로 보존
  IF req.action = 'add' THEN
    PERFORM public.attendance_validate_correction_order(emp.id,req.action,NULL,req.kind,req.requested_time);
    saved := public.attendance_insert_punch(emp, req.requested_time, 'correction', req.kind, NULL, NULL, NULL, note, caller);
  ELSE
    SELECT * INTO target FROM public.attendance_effective_punches WHERE id = req.target_punch_id;
    IF NOT FOUND THEN
      -- 대상이 이미 다른 정정으로 바뀐 경우: 요청을 자동 반려(대기로 남지 않게)
      UPDATE public.attendance_correction_requests SET status = 'rejected', reviewed_by = caller, reviewed_at = now(),
        review_note = '대상 기록이 이미 변경되어 자동 반려' WHERE id = req.id;
      RETURN NULL;
    END IF;
    partner := public.attendance_validate_correction_order(emp.id,req.action,target.id,req.kind,req.requested_time);
    IF req.action='change' AND req.kind<>target.kind THEN
      UPDATE public.attendance_correction_requests SET original_snapshot=coalesce(original_snapshot,'{}'::jsonb) ||
        jsonb_build_object('kind_changed',true,'paired_before_apply',to_jsonb(public.attendance_shift_partner(target.id)))
        WHERE id=req.id;
    END IF;
    -- Superseded versions share their root ordinal; only one version is effective.
    -- This also keeps existing latest-event queries and home sorting correct at equal times.
    INSERT INTO public.attendance_punches(store_id, employee_id, kind, punched_at, work_date, source, is_void, supersedes_id, flags, note, created_by,event_order)
    OVERRIDING SYSTEM VALUE VALUES (target.store_id, target.employee_id, coalesce(req.kind, target.kind),
      CASE WHEN req.action = 'void' THEN target.punched_at ELSE req.requested_time END,
      CASE WHEN req.action = 'void' THEN target.work_date
           WHEN coalesce(req.kind,target.kind)='clock_out' AND partner.kind='clock_in' THEN partner.work_date
           ELSE public.attendance_work_date(target.employee_id, coalesce(req.kind, target.kind), req.requested_time, target.id) END,
      'correction', req.action = 'void', target.id, '{}', note, caller,private.attendance_root_order(target.id))
    RETURNING * INTO saved;
  END IF;
  -- 출근 날짜가 바뀌면 원래 짝 퇴근의 시각을 보존한 시스템 정정을 원자적으로 추가한다.
  IF req.action='change' AND target.kind='clock_in' AND saved.kind='clock_in'
     AND partner.kind='clock_out' AND partner.work_date IS DISTINCT FROM saved.work_date THEN
    INSERT INTO public.attendance_punches(store_id,employee_id,kind,punched_at,work_date,source,supersedes_id,flags,note,created_by,event_order)
    OVERRIDING SYSTEM VALUE VALUES (partner.store_id,partner.employee_id,partner.kind,partner.punched_at,saved.work_date,'correction',partner.id,'{}',
            '출근 날짜 변경에 따른 퇴근 귀속 정정',caller,private.attendance_root_order(partner.id)) RETURNING id INTO paired_saved;
  END IF;
  UPDATE public.attendance_correction_requests SET status = 'approved', reviewed_by = caller, reviewed_at = now(),
    review_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500), applied_punch_id = saved.id, paired_applied_punch_id=paired_saved,
    original_snapshot=CASE WHEN paired_saved IS NULL THEN original_snapshot ELSE coalesce(original_snapshot,'{}'::jsonb) ||
      jsonb_build_object('paired_before_apply',jsonb_build_object('punch_id',partner.id,'kind',partner.kind,
        'punched_at',partner.punched_at,'work_date',partner.work_date)) END WHERE id = req.id;
  RETURN saved.id;
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
  IF i.id IS NULL OR i.kind<>'clock_in' OR o.punched_at<i.punched_at OR NOT (i.work_date=ANY(p_work_dates)) THEN CONTINUE; END IF;
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

CREATE OR REPLACE FUNCTION private.sync_attendance_daily_work_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE dates date[];
BEGIN
 -- Correction inserts may precede their pair/link updates; run after the request is fully approved.
 IF TG_TABLE_NAME='attendance_punches' THEN
  IF NEW.source='correction' THEN RETURN NEW; END IF;
  dates:=ARRAY[NEW.work_date];
 ELSE
  IF NEW.status<>'approved' OR OLD.status='approved' THEN RETURN NEW; END IF;
  -- Only the old/new target, adjacent events and their prior/current pair dates can change.
  -- Do not retry unrelated historical failures or reinterpret other months on a correction.
  WITH anchors AS (
   SELECT p.* FROM public.attendance_punches p
    WHERE p.id IN (NEW.target_punch_id,NEW.applied_punch_id,NEW.paired_applied_punch_id)
  ), affected AS (
   SELECT a.id,a.work_date FROM anchors a
   UNION
   SELECT p.id,p.work_date FROM anchors a CROSS JOIN LATERAL (
    SELECT p.* FROM public.attendance_effective_punches p
     WHERE p.employee_id=NEW.employee_id AND p.punched_at>=a.punched_at-interval '16 hours'
      AND (p.punched_at,private.attendance_root_order(p.id))
      <(a.punched_at,private.attendance_root_order(a.id))
     ORDER BY p.punched_at DESC,private.attendance_root_order(p.id) DESC LIMIT 1
   ) p
   UNION
   SELECT p.id,p.work_date FROM anchors a CROSS JOIN LATERAL (
    SELECT p.* FROM public.attendance_effective_punches p
     WHERE p.employee_id=NEW.employee_id AND p.punched_at<=a.punched_at+interval '16 hours'
      AND (p.punched_at,private.attendance_root_order(p.id))
      >(a.punched_at,private.attendance_root_order(a.id))
     ORDER BY p.punched_at,private.attendance_root_order(p.id) LIMIT 1
   ) p
  ), affected_dates AS (
   SELECT a.work_date FROM affected a
   UNION SELECT (public.attendance_shift_partner(a.id)).work_date FROM affected a
   UNION SELECT sh.work_date FROM private.attendance_work_shifts sh WHERE sh.employee_id=NEW.employee_id
    AND (sh.clock_in_id IN (SELECT id FROM affected) OR sh.clock_out_id IN (SELECT id FROM affected))
  ) SELECT array_agg(DISTINCT work_date) FILTER(WHERE work_date IS NOT NULL) INTO dates FROM affected_dates;
 END IF;
 PERFORM private.refresh_attendance_daily_work(NEW.employee_id,dates);
 RETURN NEW;
END $$;
COMMIT;
