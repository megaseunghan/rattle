-- QR 자동 일별 근무 / QR-A02,A04,A05 / 2026-11-18.
-- 선행: daily_work_snapshots → QR 초기/fixes/retry_guard/hardening/policy → role core/visibility/manager/legacy(17180000).
-- 적용: 아래 파일 전체를 한 트랜잭션으로. 원격 미적용. CLI 미설치로 저장소 14자리 파일명 관행 사용.
-- 복구: 실패 시 ROLLBACK; 커밋 후 새 보정으로 RPC/trigger 복원. 원본 punches/일별 감사는 삭제하지 않는다.
BEGIN;
ALTER TABLE public.attendance_punches ADD COLUMN event_order bigint GENERATED ALWAYS AS IDENTITY;
CREATE OR REPLACE VIEW public.attendance_effective_punches WITH (security_invoker = true) AS
  SELECT p.* FROM public.attendance_punches p
  WHERE NOT p.is_void
    AND NOT EXISTS (SELECT 1 FROM public.attendance_punches c WHERE c.supersedes_id = p.id);
REVOKE ALL ON SEQUENCE public.attendance_punches_event_order_seq FROM PUBLIC,anon,authenticated,service_role;
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
  IF linked_id IS NOT NULL THEN
    WITH RECURSIVE lineage AS (
      SELECT p.* FROM public.attendance_punches p WHERE p.id=linked_id AND p.employee_id=target.employee_id
      UNION
      SELECT p.* FROM public.attendance_punches p JOIN lineage l ON p.supersedes_id=l.id
    )
    SELECT p.* INTO partner FROM lineage p WHERE NOT p.is_void
      AND NOT EXISTS (SELECT 1 FROM public.attendance_punches c WHERE c.supersedes_id=p.id);
    IF partner.id IS NOT NULL AND partner.kind<>target.kind THEN RETURN partner; END IF;
    RETURN NULL;
  END IF;
  IF target.kind='clock_in' THEN
    SELECT * INTO partner FROM public.attendance_effective_punches p
    WHERE p.employee_id=target.employee_id AND (p.punched_at,p.event_order)>(target.punched_at,target.event_order)
    ORDER BY p.punched_at,p.event_order LIMIT 1;
    IF partner.kind='clock_out' AND partner.punched_at-target.punched_at <= interval '16 hours' THEN RETURN partner; END IF;
  ELSE
    SELECT * INTO partner FROM public.attendance_effective_punches p
    WHERE p.employee_id=target.employee_id AND (p.punched_at,p.event_order)<(target.punched_at,target.event_order)
    ORDER BY p.punched_at DESC,p.event_order DESC LIMIT 1;
    IF partner.kind='clock_in' AND target.punched_at-partner.punched_at <= interval '16 hours' THEN RETURN partner; END IF;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.attendance_shift_partner(uuid) FROM PUBLIC, anon, authenticated;

-- 변경 대상이 앞뒤 기록을 넘지 못하게 해 짝의 시간 역전과 다른 근무로의 이동을 막는다.
-- 같은 시각 허용. change는 종류 불변, add는 이미 짝지어진 근무 내부에 끼워 넣지 못한다.
-- 짝이 없는 자료는 이전/다음 근무인지 추정하지 않는다.
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
  IF p_kind IS DISTINCT FROM target.kind THEN RAISE EXCEPTION 'ATTENDANCE_INPUT_INVALID'; END IF;
  partner := public.attendance_shift_partner(target.id);
  IF partner.id IS NOT NULL AND (
      (target.kind='clock_in' AND p_time>partner.punched_at) OR
      (target.kind='clock_out' AND p_time<partner.punched_at)) THEN RAISE EXCEPTION 'ATTENDANCE_ORDER_INVALID'; END IF;
  SELECT * INTO adjacent FROM public.attendance_effective_punches p
  WHERE p.employee_id=p_employee_id AND p.id IS DISTINCT FROM partner.id AND (p.punched_at,p.event_order)<(target.punched_at,target.event_order)
  ORDER BY p.punched_at DESC,p.event_order DESC LIMIT 1;
  IF adjacent.id IS NOT NULL AND p_time<adjacent.punched_at THEN RAISE EXCEPTION 'ATTENDANCE_ORDER_INVALID'; END IF;
  SELECT * INTO adjacent FROM public.attendance_effective_punches p
  WHERE p.employee_id=p_employee_id AND p.id IS DISTINCT FROM partner.id AND (p.punched_at,p.event_order)>(target.punched_at,target.event_order)
  ORDER BY p.punched_at,p.event_order LIMIT 1;
  IF adjacent.id IS NOT NULL AND p_time>adjacent.punched_at THEN RAISE EXCEPTION 'ATTENDANCE_ORDER_INVALID'; END IF;
  RETURN partner;
END $$;
REVOKE ALL ON FUNCTION public.attendance_validate_correction_order(uuid,text,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;


CREATE TABLE private.attendance_work_shifts (
 clock_out_id uuid PRIMARY KEY REFERENCES public.attendance_punches(id) ON DELETE CASCADE,
 clock_in_id uuid NOT NULL REFERENCES public.attendance_punches(id) ON DELETE CASCADE,
 employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 work_date date NOT NULL,
 elapsed_minutes integer NOT NULL CHECK(elapsed_minutes>=0),
 active boolean NOT NULL DEFAULT true
);
CREATE INDEX attendance_punches_employee_date ON public.attendance_punches(employee_id,work_date);
CREATE INDEX attendance_work_shifts_employee_date ON private.attendance_work_shifts(employee_id,work_date);
CREATE TABLE private.attendance_work_sync (
 employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 work_date date NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','completed','failed')),
 error_code text,
 source_snapshot jsonb NOT NULL,
 daily_work_id uuid REFERENCES public.payroll_daily_work(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(employee_id,work_date)
);
ALTER TABLE private.attendance_work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.attendance_work_sync ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.attendance_work_shifts,private.attendance_work_sync FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_attendance_punch_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = extensions, public, pg_temp AS $$
BEGIN
  -- FK의 SET NULL(scanner_id, device_id)만 허용한다.
  IF (NEW.store_id, NEW.employee_id, NEW.kind, NEW.punched_at, NEW.work_date, NEW.source, NEW.is_void,
      NEW.supersedes_id, NEW.qr_nonce, NEW.flags, NEW.note, NEW.created_by, NEW.created_at, NEW.event_order)
     IS DISTINCT FROM
     (OLD.store_id, OLD.employee_id, OLD.kind, OLD.punched_at, OLD.work_date, OLD.source, OLD.is_void,
      OLD.supersedes_id, OLD.qr_nonce, OLD.flags, OLD.note, OLD.created_by, OLD.created_at, OLD.event_order) THEN
    RAISE EXCEPTION 'ATTENDANCE_PUNCH_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;

-- Latest effective event ends a completed shift; another scan starts a new shift after the 60s dedup window.
-- Deterministic ordering for equal timestamps. The existing inclusive 16h rule is unchanged.
CREATE OR REPLACE FUNCTION public.attendance_open_clock_in(p_employee_id uuid)
RETURNS public.attendance_punches LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT p.* FROM public.attendance_effective_punches p WHERE p.employee_id=p_employee_id
 ORDER BY p.punched_at DESC,p.event_order DESC LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.attendance_insert_punch(
  p_employee public.employees, p_at timestamptz, p_source text, p_kind text,
  p_scanner_id uuid, p_device_id uuid, p_nonce text, p_note text, p_actor uuid,
  p_supersedes uuid DEFAULT NULL, p_void boolean DEFAULT false, p_extra_flags text[] DEFAULT '{}')
RETURNS public.attendance_punches LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE last public.attendance_punches; kind text := p_kind; work date; flags text[] := coalesce(p_extra_flags, '{}');
  saved public.attendance_punches;
BEGIN
  last := public.attendance_open_clock_in(p_employee.id);
  IF kind IS NULL THEN
    IF last.id IS NOT NULL AND last.kind = 'clock_in' AND p_at - last.punched_at <= interval '16 hours' THEN
      kind := 'clock_out';
    ELSE
      kind := 'clock_in';
      IF last.id IS NOT NULL AND last.kind = 'clock_in' THEN flags := array_append(flags, 'previous_open_over_16h'); END IF;
    END IF;
  END IF;
  work := public.attendance_work_date(p_employee.id, kind, p_at);
  IF NOT p_void THEN flags := flags || public.attendance_schedule_flags(p_employee.id, kind, p_at); END IF;
  INSERT INTO public.attendance_punches(store_id, employee_id, kind, punched_at, work_date, source, is_void, supersedes_id,
    scanner_id, device_id, qr_nonce, flags, note, created_by)
  VALUES (p_employee.store_id, p_employee.id, kind, p_at, work, p_source, p_void, p_supersedes,
    p_scanner_id, p_device_id, p_nonce, flags, nullif(btrim(coalesce(p_note, '')), ''), p_actor)
  RETURNING * INTO saved;
  RETURN saved;
END $$;
REVOKE ALL ON FUNCTION public.attendance_insert_punch(public.employees, timestamptz, text, text, uuid, uuid, text, text, uuid, uuid, boolean, text[]) FROM PUBLIC, anon, authenticated;


-- Callers hold an employee row lock before the attendance advisory lock; retry uses SHARE to freeze active status.
-- Rebuild only changed day snapshots. One out-version PK prevents replay from adding minutes again.
-- A failed daily write rolls back only that subtransaction, never the confirmed attendance punch.
CREATE FUNCTION private.refresh_attendance_daily_work(p_employee_id uuid,p_work_dates date[]) RETURNS void
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
  IF prior.source_snapshot=sources AND prior.state='completed' AND NOT unpaired THEN CONTINUE; END IF;
  IF sources='[]'::jsonb AND prior.employee_id IS NULL AND NOT unpaired THEN CONTINUE; END IF;
  -- Invalidate settlement even if rate/day-bound validation fails. Monthly gross/snapshot stay historical.
  UPDATE public.payroll SET is_settled=false,settled_at=NULL
   WHERE employee_id=emp.id AND year_month=to_char(d.work_date,'YYYY-MM') AND is_settled;
  problem:=NULL; saved:=NULL;
  BEGIN
   IF unpaired THEN RAISE EXCEPTION 'ATTENDANCE_WORK_PAIR_REQUIRED'; END IF;
   IF sources='[]'::jsonb THEN
    -- A correction moved/voided the last pair: retain the old audited value, exclude it from future monthly sources.
    UPDATE public.payroll_daily_work SET status='pending',reviewed_by=NULL,review_note=NULL,
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
   INSERT INTO public.payroll_daily_work(store_id,employee_id,work_date,worked_minutes,applied_hourly_wage,gross,note,status,submitted_by)
   VALUES(emp.store_id,emp.id,d.work_date,minutes,rate,round(minutes*rate/60),'QR 출퇴근 자동 기록','pending',NULL)
   ON CONFLICT(employee_id,work_date) DO UPDATE SET worked_minutes=excluded.worked_minutes,gross=excluded.gross,
    status='pending',note=excluded.note,revision=payroll_daily_work.revision+1,submitted_by=NULL,reviewed_by=NULL,
    review_note=NULL,updated_at=clock_timestamp() RETURNING * INTO saved;
  EXCEPTION WHEN OTHERS THEN
   -- Persist stable public code only; never return SQL text or sensitive values.
   problem:=CASE WHEN SQLERRM IN ('ATTENDANCE_WORK_PAIR_REQUIRED','ATTENDANCE_WORK_DAY_LIMIT',
    'ATTENDANCE_WORK_DATE_INVALID','DAILY_WORK_RATE_REQUIRED') THEN SQLERRM ELSE 'ATTENDANCE_WORK_WRITE_FAILED' END;
  END;
  IF problem IS NOT NULL THEN
   -- A stale approved amount must not remain eligible for payroll after a failed recalculation.
   UPDATE public.payroll_daily_work SET status='pending',reviewed_by=NULL,review_note=NULL,
    revision=revision+1,updated_at=clock_timestamp() WHERE employee_id=emp.id AND work_date=d.work_date AND status<>'pending';
  END IF;
  INSERT INTO private.attendance_work_sync(employee_id,store_id,work_date,state,error_code,source_snapshot,daily_work_id)
  VALUES(emp.id,emp.store_id,d.work_date,CASE WHEN problem IS NULL THEN 'completed' ELSE 'failed' END,problem,sources,saved.id)
  ON CONFLICT(employee_id,work_date) DO UPDATE SET state=excluded.state,error_code=excluded.error_code,
   source_snapshot=excluded.source_snapshot,daily_work_id=excluded.daily_work_id,updated_at=clock_timestamp();
 END LOOP;
END $$;

CREATE FUNCTION private.sync_attendance_daily_work_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE dates date[];
BEGIN
 -- Correction inserts may precede their pair/link updates; run after the request is fully approved.
 IF TG_TABLE_NAME='attendance_punches' THEN
  IF NEW.source='correction' THEN RETURN NEW; END IF;
  dates:=ARRAY[NEW.work_date];
 ELSE
  IF NEW.status<>'approved' OR OLD.status='approved' THEN RETURN NEW; END IF;
  SELECT array_agg(DISTINCT p.work_date) INTO dates FROM public.attendance_punches p
   WHERE p.id IN (NEW.target_punch_id,NEW.applied_punch_id,NEW.paired_applied_punch_id);
 END IF;
 PERFORM private.refresh_attendance_daily_work(NEW.employee_id,dates);
 RETURN NEW;
END $$;
CREATE TRIGGER sync_attendance_daily_work AFTER INSERT ON public.attendance_punches
 FOR EACH ROW EXECUTE FUNCTION private.sync_attendance_daily_work_trigger();
CREATE TRIGGER sync_attendance_daily_work AFTER UPDATE ON public.attendance_correction_requests
 FOR EACH ROW EXECUTE FUNCTION private.sync_attendance_daily_work_trigger();

CREATE FUNCTION public.get_attendance_work_record(p_punch_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE p public.attendance_punches; emp public.employees; sh private.attendance_work_shifts; sync private.attendance_work_sync;
 day public.payroll_daily_work; effective_id uuid;
BEGIN
 SELECT * INTO p FROM public.attendance_punches WHERE id=p_punch_id;
 SELECT * INTO emp FROM public.employees WHERE id=p.employee_id;
 IF auth.uid() IS NULL OR p.id IS NULL OR NOT public.is_store_member(p.store_id)
  OR NOT public.is_store_active(p.store_id) OR NOT public.can_read_employee(p.store_id,p.employee_id)
  OR (emp.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_store_admin(p.store_id))
 THEN RAISE EXCEPTION 'ATTENDANCE_WORK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 WITH RECURSIVE lineage AS (
  SELECT * FROM public.attendance_punches WHERE id=p.id
  UNION ALL SELECT n.* FROM public.attendance_punches n JOIN lineage l ON n.supersedes_id=l.id
 ) SELECT id INTO effective_id FROM lineage l WHERE NOT EXISTS(SELECT 1 FROM public.attendance_punches n WHERE n.supersedes_id=l.id);
 SELECT * INTO sh FROM private.attendance_work_shifts WHERE clock_out_id=effective_id AND active;
 SELECT * INTO sync FROM private.attendance_work_sync WHERE employee_id=p.employee_id AND work_date=coalesce(sh.work_date,p.work_date);
 SELECT * INTO day FROM public.payroll_daily_work WHERE id=sync.daily_work_id;
 RETURN jsonb_build_object('punch_id',p.id,'effective_punch_id',effective_id,'employee_id',emp.id,
  'eligible',emp.employment_type='part_time','state',CASE
   WHEN emp.employment_type<>'part_time' THEN 'not_applicable'
   WHEN sh.clock_out_id IS NULL THEN CASE WHEN p.kind='clock_out' THEN 'failed' ELSE 'pending' END ELSE coalesce(sync.state,'pending') END,
  'error_code',CASE WHEN sh.clock_out_id IS NOT NULL THEN sync.error_code WHEN p.kind='clock_out' THEN coalesce(sync.error_code,'ATTENDANCE_WORK_PAIR_REQUIRED') ELSE NULL END,
  'clock_in_id',sh.clock_in_id,'clock_out_id',sh.clock_out_id,'work_date',coalesce(sh.work_date,p.work_date),
  'shift_minutes',sh.elapsed_minutes,'daily_work_id',day.id,'daily_minutes',day.worked_minutes,
  'daily_revision',day.revision,'daily_gross',day.gross,'applied_hourly_wage',day.applied_hourly_wage,'review_status',day.status,'updated_at',sync.updated_at);
END $$;
CREATE FUNCTION public.retry_attendance_work_record(p_punch_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE eid uuid; original_day date; current_day date;
BEGIN
 PERFORM public.get_attendance_work_record(p_punch_id); -- read access; retry write permission is checked separately below
 SELECT employee_id,work_date INTO eid,original_day FROM public.attendance_punches WHERE id=p_punch_id;
 IF NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=eid
  AND (e.is_active IS TRUE OR public.is_store_admin(e.store_id)))
 THEN RAISE EXCEPTION 'ATTENDANCE_WORK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 -- SHARE also blocks non-key employment-status changes until this retry commits.
 PERFORM 1 FROM public.employees WHERE id=eid FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtextextended('attendance_punch:'||eid::text,0));
 PERFORM public.get_attendance_work_record(p_punch_id); -- revalidate after waiting
 IF NOT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=eid
  AND (e.is_active IS TRUE OR public.is_store_admin(e.store_id)))
 THEN RAISE EXCEPTION 'ATTENDANCE_WORK_FORBIDDEN' USING ERRCODE='42501'; END IF;
 current_day:=(public.get_attendance_work_record(p_punch_id)->>'work_date')::date;
 PERFORM private.refresh_attendance_daily_work(eid,ARRAY[original_day,current_day]);
 RETURN public.get_attendance_work_record(p_punch_id);
END $$;
REVOKE ALL ON FUNCTION private.refresh_attendance_daily_work(uuid,date[]),private.sync_attendance_daily_work_trigger()
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_attendance_work_record(uuid),public.retry_attendance_work_record(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_attendance_work_record(uuid),public.retry_attendance_work_record(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.daily_work_month_snapshot(p_employee_id uuid,p_year_month text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'work_date',work_date,'worked_minutes',worked_minutes,'applied_hourly_wage',applied_hourly_wage,'gross',gross,'status',status) ORDER BY work_date),'[]'::jsonb)
 FROM public.payroll_daily_work WHERE NOT EXISTS(SELECT 1 FROM private.attendance_work_sync s WHERE s.employee_id=payroll_daily_work.employee_id AND s.work_date=payroll_daily_work.work_date AND s.state='completed' AND s.source_snapshot='[]'::jsonb) AND employee_id=p_employee_id AND work_date>= (p_year_month||'-01')::date AND work_date<((p_year_month||'-01')::date+interval '1 month');
$$;
REVOKE ALL ON FUNCTION public.daily_work_month_snapshot(uuid,text) FROM PUBLIC,anon,authenticated;

-- Current rows exclude obsolete dates; their immutable history remains readable under existing access rules.
CREATE FUNCTION public.is_current_attendance_work_day(p_employee_id uuid,p_work_date date) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee_id
  AND public.can_read_employee(e.store_id,e.id)) AND NOT EXISTS(SELECT 1 FROM private.attendance_work_sync s
   WHERE s.employee_id=p_employee_id AND s.work_date=p_work_date AND s.state='completed' AND s.source_snapshot='[]'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.is_current_attendance_work_day(uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.is_current_attendance_work_day(uuid,date) TO authenticated;
CREATE POLICY qr_current_daily_work ON public.payroll_daily_work AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.is_current_attendance_work_day(employee_id,work_date));

CREATE OR REPLACE FUNCTION public.get_daily_labor_sources(p_store_id uuid,p_year_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_store_admin(p_store_id),false) THEN
   RAISE EXCEPTION 'DAILY_LABOR_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_year_month IS NULL OR p_year_month !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_LABOR_PERIOD'; END IF;
 IF EXISTS(SELECT 1 FROM private.attendance_work_sync s WHERE s.store_id=p_store_id
  AND to_char(s.work_date,'YYYY-MM')=p_year_month AND s.state<>'completed')
  THEN RAISE EXCEPTION 'ATTENDANCE_WORK_RECALC_REQUIRED'; END IF;
 RETURN jsonb_build_object(
 'monthlyLaborCost',(SELECT labor_cost FROM public.get_financial_summaries_v2(ARRAY[p_store_id],ARRAY[p_year_month],true)),
 'employees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'store_id',e.store_id,'joined_at',e.joined_at,'is_active',e.is_active,'employment_type',e.employment_type,'is_resigned_during_probation',e.is_resigned_during_probation)),'[]') FROM public.employees e WHERE e.store_id=p_store_id AND (e.joined_at IS NULL OR e.joined_at<(p_year_month||'-01')::date+interval '1 month')),
 'payrolls',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'store_id',p.store_id,'employee_id',p.employee_id,'year_month',btrim(p.year_month),'gross',p.gross,'regular_wage_snapshot',p.regular_wage_snapshot,'daily_work_snapshot',p.daily_work_snapshot,'applied_hourly_wage',p.applied_hourly_wage,'work_source',p.work_source)),'[]') FROM public.payroll p WHERE p.store_id=p_store_id AND p.year_month=p_year_month),
 'dailyWork',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'store_id',d.store_id,'employee_id',d.employee_id,'work_date',d.work_date,'revision',d.revision,'status',d.status)),'[]') FROM public.payroll_daily_work d WHERE NOT EXISTS(SELECT 1 FROM private.attendance_work_sync s WHERE s.employee_id=d.employee_id AND s.work_date=d.work_date AND s.state='completed' AND s.source_snapshot='[]'::jsonb) AND d.store_id=p_store_id AND d.work_date>=(p_year_month||'-01')::date AND d.work_date<(p_year_month||'-01')::date+interval '1 month'),
 'wages',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',w.id,'store_id',w.store_id,'employee_id',w.employee_id,'effective_date',w.effective_date,'created_at',w.created_at,'base_salary',w.base_salary,'non_taxable',w.non_taxable)),'[]') FROM public.employee_wage_history w WHERE w.store_id=p_store_id AND w.effective_date<(p_year_month||'-01')::date+interval '1 month')
 );
END $$;

-- Failed/missing recalculations cannot be approved or silently omitted from a monthly snapshot.
CREATE FUNCTION private.guard_attendance_work_review() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='payroll_daily_work' THEN
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
CREATE TRIGGER guard_attendance_work_review BEFORE INSERT OR UPDATE ON public.payroll_daily_work
 FOR EACH ROW EXECUTE FUNCTION private.guard_attendance_work_review();
CREATE TRIGGER guard_attendance_work_review BEFORE INSERT OR UPDATE ON public.payroll
 FOR EACH ROW EXECUTE FUNCTION private.guard_attendance_work_review();
REVOKE ALL ON FUNCTION private.guard_attendance_work_review() FROM PUBLIC,anon,authenticated,service_role;

-- Removed manual submission surface: block both RPC and direct table writes, including old permissive policies.
REVOKE EXECUTE ON FUNCTION public.submit_work_minutes(uuid,text,integer,text,uuid),public.review_work_minutes(uuid,text,text),
 public.save_daily_work(uuid,date,integer,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.payroll_work_submissions FROM anon,authenticated;
CREATE POLICY qr_manual_submission_insert_block ON public.payroll_work_submissions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(false);
CREATE POLICY qr_manual_submission_update_block ON public.payroll_work_submissions AS RESTRICTIVE FOR UPDATE TO authenticated USING(false) WITH CHECK(false);
CREATE POLICY qr_manual_submission_delete_block ON public.payroll_work_submissions AS RESTRICTIVE FOR DELETE TO authenticated USING(false);
REVOKE ALL ON FUNCTION public.attendance_open_clock_in(uuid),public.guard_attendance_punch_immutable(),
 public.attendance_shift_partner(uuid),public.attendance_validate_correction_order(uuid,text,uuid,text,timestamptz),
 public.attendance_insert_punch(public.employees,timestamptz,text,text,uuid,uuid,text,text,uuid,uuid,boolean,text[])
 FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
