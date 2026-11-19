-- In-app QR followups only. Prerequisite: 20261119130000_attendance_kind_corrections.sql,
-- existing notifications, personal dismissals and store visibility migrations.
-- No push/mail/external delivery. Original work and payroll values remain unchanged.
BEGIN;
-- Ordinary CREATE INDEX takes SHARE locks and blocks attendance INSERTs while held.
-- Fail fast on lock contention: ROLLBACK, then retry this entire file in a quiet window.
-- Small development DB only; revisit CONCURRENTLY before a separate production rollout.
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.notifications
 ADD COLUMN attendance_employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
 ADD COLUMN attendance_punch_id uuid REFERENCES public.attendance_punches(id) ON DELETE CASCADE,
 ADD COLUMN attendance_work_date date,
 ADD COLUMN resolved_at timestamptz;
CREATE INDEX notifications_attendance_employee ON public.notifications(attendance_employee_id) WHERE attendance_employee_id IS NOT NULL;
CREATE INDEX notifications_attendance_punch ON public.notifications(attendance_punch_id) WHERE attendance_punch_id IS NOT NULL;

-- Only changed staff and timed checks enter the private queue. An inactive staff
-- member is deliberately retained: unfinished former staff work still needs an admin.
CREATE TABLE private.attendance_notification_queue (
 employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
 next_check_at timestamptz NOT NULL
);
ALTER TABLE private.attendance_notification_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.attendance_notification_queue FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX attendance_notification_queue_due ON private.attendance_notification_queue(next_check_at,employee_id);
CREATE INDEX attendance_work_sync_failed_employee ON private.attendance_work_sync(employee_id,work_date) WHERE state='failed';

-- One-time backfill without an age cutoff, including staff with only old work.
-- The five-minute job enumerates this queue only, never all employee history.
INSERT INTO private.attendance_notification_queue(employee_id,next_check_at)
SELECT employee_id,now() FROM (
 SELECT p.employee_id FROM public.attendance_effective_punches p
 WHERE p.kind='clock_in' AND (public.attendance_shift_partner(p.id)).id IS NULL
 UNION SELECT employee_id FROM private.attendance_work_sync WHERE state='failed'
) candidates;

-- One canonical event per original punch/reason. Current recipients are evaluated at read time.
CREATE OR REPLACE FUNCTION private.attendance_unprocessed_events(p_employee_id uuid DEFAULT NULL)
RETURNS TABLE(store_id uuid,employee_id uuid,punch_id uuid,work_date date,reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT p.store_id,p.employee_id,p.id,p.work_date,'attendance_missing_checkout'::text
 FROM public.attendance_effective_punches p JOIN public.employees e ON e.id=p.employee_id
 WHERE (p_employee_id IS NULL OR p.employee_id=p_employee_id) AND public.is_store_active(p.store_id)
  AND p.kind='clock_in' AND p.punched_at < now()-interval '16 hours'
  -- Employee-scoped discovery includes corrections/additions to arbitrarily old work.
  AND (public.attendance_shift_partner(p.id)).id IS NULL
 UNION ALL
 SELECT p.store_id,p.employee_id,p.id,s.work_date,'attendance_labor_failed'::text
 FROM private.attendance_work_sync s JOIN public.attendance_effective_punches p
  ON p.employee_id=s.employee_id AND p.store_id=s.store_id AND p.kind='clock_out'
  AND p.id IN (
   SELECT q.id FROM public.attendance_punches q WHERE q.employee_id=s.employee_id AND q.work_date=s.work_date
   UNION SELECT sh.clock_out_id FROM private.attendance_work_shifts sh
    WHERE sh.employee_id=s.employee_id AND sh.work_date=s.work_date AND sh.active)
 WHERE (p_employee_id IS NULL OR s.employee_id=p_employee_id) AND s.state='failed' AND public.is_store_active(s.store_id);
$$;
REVOKE ALL ON FUNCTION private.attendance_unprocessed_events(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.refresh_attendance_notifications(p_employee_id uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE next_due timestamptz;
BEGIN
 -- Serialize refreshes. Employee scope takes the same lock as scan/correction/retry.
 IF p_employee_id IS NULL THEN
  -- Compatibility entry point: bounded work only. Cron uses the procedure below
  -- to commit and release each employee lock before taking the next one.
  FOR p_employee_id IN SELECT q.employee_id FROM private.attendance_notification_queue q
   WHERE q.next_check_at<=now() ORDER BY q.next_check_at,q.employee_id LIMIT 25 LOOP
   PERFORM private.refresh_attendance_notifications(p_employee_id);
  END LOOP;
  RETURN;
 END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('attendance_punch:'||p_employee_id::text,0)) THEN
  -- Rotate contended employees behind untouched due work instead of starving it.
  INSERT INTO private.attendance_notification_queue VALUES(p_employee_id,clock_timestamp()+interval '1 minute')
  ON CONFLICT(employee_id) DO UPDATE SET next_check_at=excluded.next_check_at;
  RETURN;
 END IF;
 UPDATE public.notifications n SET resolved_at=clock_timestamp()
 WHERE n.attendance_employee_id=p_employee_id AND n.resolved_at IS NULL
  AND n.type IN ('attendance_missing_checkout','attendance_labor_failed')
  AND NOT EXISTS(SELECT 1 FROM private.attendance_unprocessed_events(p_employee_id) e
   WHERE e.punch_id=n.attendance_punch_id AND e.reason=n.type);
 INSERT INTO public.notifications(store_id,category,type,title,message,dedupe_key,attendance_employee_id,attendance_punch_id,attendance_work_date,resolved_at)
 SELECT e.store_id,'attendance',e.reason,
  CASE WHEN e.reason='attendance_missing_checkout' THEN '퇴근 기록이 없어요' ELSE '인건비를 확인해주세요' END,
  coalesce(nullif(btrim(person.name),''),'직원')||'님 · '||to_char(e.work_date,'FMMM월 FMDD일')||' · '||
  CASE WHEN e.reason='attendance_missing_checkout' THEN '출퇴근 기록을 확인하고 정정을 요청해주세요'
   ELSE '퇴근 기록의 인건비를 반영하지 못했어요. 급여 탭에서 확인해주세요' END,
  e.reason||':'||e.punch_id::text,e.employee_id,e.punch_id,e.work_date,NULL
 FROM private.attendance_unprocessed_events(p_employee_id) e JOIN public.employees person ON person.id=e.employee_id
 ON CONFLICT(store_id,dedupe_key) DO UPDATE SET resolved_at=NULL,attendance_work_date=excluded.attendance_work_date
 WHERE notifications.resolved_at IS NOT NULL;
 -- A clock-in is checked once when it crosses 16h; writes re-evaluate immediately.
 SELECT min(p.punched_at+interval '16 hours 1 microsecond') INTO next_due
 FROM public.attendance_effective_punches p WHERE p.employee_id=p_employee_id
  AND p.kind='clock_in' AND p.punched_at>=now()-interval '16 hours'
  AND (public.attendance_shift_partner(p.id)).id IS NULL;
 DELETE FROM private.attendance_notification_queue WHERE employee_id=p_employee_id;
 IF next_due IS NOT NULL THEN
  INSERT INTO private.attendance_notification_queue VALUES(p_employee_id,next_due);
 END IF;
END $$;
REVOKE ALL ON FUNCTION private.refresh_attendance_notifications(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Trusted scheduler only. Top-level CALL is required for per-employee COMMIT.
-- No SECURITY DEFINER / SET clause: PostgreSQL disallows COMMIT with those.
CREATE PROCEDURE private.process_attendance_notification_queue()
LANGUAGE plpgsql AS $$
DECLARE candidate record;
BEGIN
 FOR candidate IN SELECT q.employee_id FROM private.attendance_notification_queue q
  WHERE q.next_check_at<=pg_catalog.now() ORDER BY q.next_check_at,q.employee_id LIMIT 25 LOOP
  PERFORM private.refresh_attendance_notifications(candidate.employee_id);
  COMMIT;
 END LOOP;
END $$;
REVOKE ALL ON PROCEDURE private.process_attendance_notification_queue() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.refresh_attendance_notifications_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='attendance_punches' THEN
  IF NEW.source='correction' THEN RETURN NEW; END IF;
 ELSIF TG_TABLE_NAME='attendance_correction_requests' THEN
  IF NEW.status<>'approved' OR OLD.status='approved' THEN RETURN NEW; END IF;
 END IF;
 -- Persist a targeted retry even when the immediate refresh cannot take its lock.
 INSERT INTO private.attendance_notification_queue VALUES(NEW.employee_id,clock_timestamp())
 ON CONFLICT(employee_id) DO UPDATE SET next_check_at=least(attendance_notification_queue.next_check_at,excluded.next_check_at);
 PERFORM private.refresh_attendance_notifications(NEW.employee_id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.refresh_attendance_notifications_trigger() FROM PUBLIC,anon,authenticated,service_role;
-- z prefix runs after sync_attendance_daily_work; sync updates also cover explicit retry.
CREATE TRIGGER z_attendance_notifications AFTER INSERT ON public.attendance_punches
 FOR EACH ROW EXECUTE FUNCTION private.refresh_attendance_notifications_trigger();
CREATE TRIGGER z_attendance_notifications AFTER UPDATE ON public.attendance_correction_requests
 FOR EACH ROW EXECUTE FUNCTION private.refresh_attendance_notifications_trigger();
CREATE TRIGGER z_attendance_notifications AFTER INSERT OR UPDATE ON private.attendance_work_sync
 FOR EACH ROW EXECUTE FUNCTION private.refresh_attendance_notifications_trigger();

CREATE OR REPLACE FUNCTION public.can_read_attendance_notification(p_store_id uuid,p_employee_id uuid,p_type text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT public.is_store_active(p_store_id) AND (public.is_store_admin(p_store_id) OR (
  p_type='attendance_missing_checkout' AND public.attendance_member_approved(p_store_id,(SELECT auth.uid()))
  AND EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee_id AND e.store_id=p_store_id
   AND e.user_id=(SELECT auth.uid()) AND e.is_active)));
$$;
REVOKE ALL ON FUNCTION public.can_read_attendance_notification(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.can_read_attendance_notification(uuid,uuid,text) TO authenticated;
DROP POLICY IF EXISTS visibility_attendance_notification_gate ON public.notifications;
CREATE POLICY visibility_attendance_notification_gate ON public.notifications AS RESTRICTIVE FOR SELECT TO authenticated
 USING(category<>'attendance' OR (resolved_at IS NULL AND public.can_read_attendance_notification(store_id,attendance_employee_id,type)));
CREATE POLICY attendance_notification_update_gate ON public.notifications AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(category<>'attendance' OR (resolved_at IS NULL AND public.can_read_attendance_notification(store_id,attendance_employee_id,type)))
 WITH CHECK(category<>'attendance' OR (resolved_at IS NULL AND public.can_read_attendance_notification(store_id,attendance_employee_id,type)));
-- Existing generic notification writes cannot forge, resolve, or delete server-owned QR events.
CREATE FUNCTION public.guard_attendance_notification_write() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF TG_OP='DELETE' THEN
   IF OLD.attendance_employee_id IS NOT NULL THEN RAISE EXCEPTION 'NOTIFICATION_SERVER_OWNED' USING ERRCODE='42501'; END IF;
  ELSIF TG_OP='INSERT' THEN
   IF NEW.attendance_employee_id IS NOT NULL OR NEW.attendance_punch_id IS NOT NULL OR NEW.attendance_work_date IS NOT NULL OR NEW.resolved_at IS NOT NULL
    OR NEW.type IN ('attendance_missing_checkout','attendance_labor_failed') THEN
    RAISE EXCEPTION 'NOTIFICATION_SERVER_OWNED' USING ERRCODE='42501'; END IF;
  ELSIF OLD.attendance_employee_id IS NOT NULL OR NEW.attendance_employee_id IS NOT NULL
   OR NEW.type IN ('attendance_missing_checkout','attendance_labor_failed') THEN
   IF to_jsonb(NEW)-'is_read' IS DISTINCT FROM to_jsonb(OLD)-'is_read' THEN
    RAISE EXCEPTION 'NOTIFICATION_SERVER_OWNED' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_attendance_notification_write() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_attendance_notification_write BEFORE INSERT OR UPDATE OR DELETE ON public.notifications
 FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_notification_write();

-- Manager list includes overdue open work as well as failed automatic payroll application.
CREATE OR REPLACE FUNCTION public.get_admin_attendance_work_issues(p_store_id uuid,p_from date,p_to date)
RETURNS TABLE(employee_id uuid,employee_name text,work_date date,error_code text,updated_at timestamptz,retry_punch_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_store_admin(p_store_id),false) THEN
  RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_from IS NULL OR p_to IS NULL OR p_from>p_to OR p_to-p_from>366 THEN RAISE EXCEPTION 'ATTENDANCE_INPUT_INVALID'; END IF;
 RETURN QUERY
 SELECT DISTINCT ON (q.work_date,q.employee_id) q.employee_id,q.employee_name,q.work_date,q.error_code,q.updated_at,q.retry_punch_id FROM (
  SELECT s.employee_id,e.name employee_name,s.work_date,s.error_code,s.updated_at,retry.id retry_punch_id
  FROM private.attendance_work_sync s JOIN public.employees e ON e.id=s.employee_id AND e.store_id=s.store_id
  LEFT JOIN LATERAL (
   SELECT p.id FROM public.attendance_effective_punches p WHERE p.employee_id=s.employee_id AND p.store_id=s.store_id AND p.kind='clock_out'
    AND (p.work_date=s.work_date OR EXISTS(SELECT 1 FROM private.attendance_work_shifts sh
      WHERE sh.clock_out_id=p.id AND sh.work_date=s.work_date AND sh.active)) ORDER BY p.punched_at DESC,p.event_order DESC LIMIT 1
  ) retry ON true
  WHERE s.store_id=p_store_id AND s.work_date BETWEEN p_from AND p_to AND s.state='failed'
  UNION ALL
  SELECT ev.employee_id,e.name,ev.work_date,'ATTENDANCE_CHECKOUT_MISSING',p.punched_at,NULL::uuid
  FROM private.attendance_unprocessed_events() ev JOIN public.employees e ON e.id=ev.employee_id
  JOIN public.attendance_punches p ON p.id=ev.punch_id
  WHERE ev.store_id=p_store_id AND ev.work_date BETWEEN p_from AND p_to AND ev.reason='attendance_missing_checkout'
 ) q ORDER BY q.work_date,q.employee_id,(q.error_code='ATTENDANCE_CHECKOUT_MISSING') DESC,q.updated_at,q.retry_punch_id LIMIT 1000;
END $$;
COMMIT;
