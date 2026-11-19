-- QR 출퇴근 정책 보정 (2026-11-17, 사용자 결정 A/B/D/E 및 조정자 해석 C)
-- 선행: 초기 QR → fixes → retry_guard → 20261117130000_qr_attendance_hardening.sql → 이 파일.
-- 관리자에게 정규직을 허용하지 않는 범위는 조정자 해석(사용자 재확인 중)으로 구현.
-- 기존 RPC 인자/반환은 유지. 새 오류: ATTENDANCE_OWNER_REQUIRED, ATTENDANCE_ORDER_INVALID.
-- 원격 미적용. 실패 시 전체 ROLLBACK; 적용 후 복구는 새 migration으로 해당 함수만 이전 정의 복원.
-- 생성된 시스템 정정/원본/요청 이력을 삭제하거나 이전 migration 전체를 재실행하지 않는다.
BEGIN;

-- paired_applied_punch_id: 출근 정정과 같은 트랜잭션에서 만든 퇴근 귀속 정정의 구조화된 이력 연결.
ALTER TABLE public.attendance_correction_requests ADD COLUMN IF NOT EXISTS paired_applied_punch_id uuid
  REFERENCES public.attendance_punches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS attendance_correction_requests_paired_applied
  ON public.attendance_correction_requests(paired_applied_punch_id) WHERE paired_applied_punch_id IS NOT NULL;

-- 소유자는 본인 포함 모두 처리. 직원 관리자는 승인 admin + 활성 정규직이어야 하며,
-- 본인/다른 관리자/소유자를 제외한 파트타이머만 처리한다. 고용형태가 파트타임인 admin도 승인권 없음.
CREATE OR REPLACE FUNCTION public.attendance_can_review_employee(p_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees target JOIN public.stores s ON s.id=target.store_id AND s.deleted_at IS NULL
    WHERE target.id=p_employee_id AND (
      s.owner_id=auth.uid() OR (
        target.employment_type='part_time' AND target.user_id IS DISTINCT FROM auth.uid()
        AND target.user_id IS DISTINCT FROM s.owner_id
        AND NOT EXISTS (SELECT 1 FROM public.store_members tm WHERE tm.store_id=s.id
                        AND tm.user_id=target.user_id AND tm.role='admin' AND tm.status='approved')
        AND EXISTS (SELECT 1 FROM public.store_members m WHERE m.store_id=s.id AND m.user_id=auth.uid()
                    AND m.role='admin' AND m.status='approved')
        AND EXISTS (SELECT 1 FROM public.employees actor WHERE actor.store_id=s.id AND actor.user_id=auth.uid()
                    AND actor.is_active AND actor.employment_type='regular')
      )
    )
  );
$$;
REVOKE ALL ON FUNCTION public.attendance_can_review_employee(uuid) FROM PUBLIC, anon, authenticated;

-- 날짜 귀속도 정확히 16시간을 포함한다(자동 퇴근 판정과 동일).
CREATE OR REPLACE FUNCTION public.attendance_work_date(p_employee_id uuid, p_kind text, p_at timestamptz, p_exclude uuid DEFAULT NULL)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
  SELECT CASE WHEN p_kind = 'clock_out' THEN coalesce((
    SELECT p.work_date FROM public.attendance_effective_punches p
    WHERE p.employee_id = p_employee_id AND p.kind = 'clock_in' AND p.id IS DISTINCT FROM p_exclude
      AND p.punched_at <= p_at AND p.punched_at >= p_at - interval '16 hours'
    ORDER BY p.punched_at DESC LIMIT 1), public.kst_date(p_at))
  ELSE public.kst_date(p_at) END;
$$;

-- 같은 직원의 유효 기록을 시각/생성 시각/ID순으로 정렬해 바로 이웃한 반대 종류만 같은 근무로 본다.
-- 중간의 다른 출근/퇴근을 건너뛰지 않는다. 기존 work_date와 동일하게 간격은 자동 퇴근 판정과 같은 16시간 이하다.
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
    WHERE p.employee_id=target.employee_id AND (p.punched_at,p.created_at,p.id)>(target.punched_at,target.created_at,target.id)
    ORDER BY p.punched_at,p.created_at,p.id LIMIT 1;
    IF partner.kind='clock_out' AND partner.punched_at-target.punched_at <= interval '16 hours' THEN RETURN partner; END IF;
  ELSE
    SELECT * INTO partner FROM public.attendance_effective_punches p
    WHERE p.employee_id=target.employee_id AND (p.punched_at,p.created_at,p.id)<(target.punched_at,target.created_at,target.id)
    ORDER BY p.punched_at DESC,p.created_at DESC,p.id DESC LIMIT 1;
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
  WHERE p.employee_id=p_employee_id AND p.id IS DISTINCT FROM partner.id AND (p.punched_at,p.created_at,p.id)<(target.punched_at,target.created_at,target.id)
  ORDER BY p.punched_at DESC,p.created_at DESC,p.id DESC LIMIT 1;
  IF adjacent.id IS NOT NULL AND p_time<adjacent.punched_at THEN RAISE EXCEPTION 'ATTENDANCE_ORDER_INVALID'; END IF;
  SELECT * INTO adjacent FROM public.attendance_effective_punches p
  WHERE p.employee_id=p_employee_id AND p.id IS DISTINCT FROM partner.id AND (p.punched_at,p.created_at,p.id)>(target.punched_at,target.created_at,target.id)
  ORDER BY p.punched_at,p.created_at,p.id LIMIT 1;
  IF adjacent.id IS NOT NULL AND p_time>adjacent.punched_at THEN RAISE EXCEPTION 'ATTENDANCE_ORDER_INVALID'; END IF;
  RETURN partner;
END $$;
REVOKE ALL ON FUNCTION public.attendance_validate_correction_order(uuid,text,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;

-- 야간 퇴근은 실제 직전 출근의 근무일 스케줄을 사용하고, 종료 시각에 다음 날짜를 붙인다.
CREATE OR REPLACE FUNCTION public.attendance_schedule_flags(p_employee_id uuid, p_kind text, p_at timestamptz)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE s public.employee_schedules; work_day date := public.kst_date(p_at); last_event public.attendance_punches;
  expected_start timestamptz; expected_end timestamptz;
BEGIN
  IF p_kind='clock_out' THEN
    SELECT p.* INTO last_event FROM public.attendance_effective_punches p
    WHERE p.employee_id=p_employee_id AND p.punched_at<=p_at
    ORDER BY p.punched_at DESC,p.created_at DESC,p.id DESC LIMIT 1;
    IF FOUND AND last_event.kind='clock_in' THEN work_day := public.kst_date(last_event.punched_at);
    ELSE
      -- 누락 출근의 직접 기록도 전날 야간 스케줄 시작 후 16시간 안이면 전날 스케줄로 판정.
      SELECT * INTO s FROM public.employee_schedules WHERE employee_id=p_employee_id
        AND day_of_week=extract(dow FROM work_day-1) AND is_working AND end_time<start_time;
      IF FOUND AND p_at >= ((work_day-1+s.start_time) AT TIME ZONE 'Asia/Seoul')
         AND p_at < ((work_day-1+s.start_time) AT TIME ZONE 'Asia/Seoul')+interval '16 hours' THEN work_day:=work_day-1; END IF;
    END IF;
  END IF;
  SELECT * INTO s FROM public.employee_schedules WHERE employee_id=p_employee_id AND day_of_week=extract(dow FROM work_day);
  IF NOT FOUND OR NOT s.is_working OR s.start_time IS NULL OR s.end_time IS NULL THEN
    RETURN CASE WHEN p_kind='clock_in' THEN ARRAY['no_schedule'] ELSE '{}'::text[] END;
  END IF;
  expected_start := (work_day+s.start_time) AT TIME ZONE 'Asia/Seoul';
  expected_end := (work_day+s.end_time+CASE WHEN s.end_time<s.start_time THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE 'Asia/Seoul';
  IF p_kind='clock_in' AND p_at<expected_start-interval '10 minutes' THEN RETURN ARRAY['early_clock_in']; END IF;
  IF p_kind='clock_out' AND s.end_time<>s.start_time AND p_at>expected_end+interval '10 minutes' THEN RETURN ARRAY['late_clock_out']; END IF;
  RETURN '{}'::text[];
END $$;


CREATE OR REPLACE FUNCTION public.record_manual_attendance(p_store_id uuid, p_employee_id uuid, p_kind text, p_at timestamptz, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); emp public.employees; saved public.attendance_punches;
BEGIN
  IF caller IS NULL OR NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
  IF p_kind NOT IN ('clock_in', 'clock_out') OR p_at IS NULL OR p_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'ATTENDANCE_INPUT_INVALID'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) = 0 THEN RAISE EXCEPTION 'ATTENDANCE_REASON_REQUIRED'; END IF;
  SELECT * INTO emp FROM public.employees WHERE id = p_employee_id AND store_id = p_store_id AND is_active FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_NOT_EMPLOYEE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance_punch:' || emp.id::text, 0));
  IF NOT public.attendance_can_review_employee(emp.id) THEN RAISE EXCEPTION 'ATTENDANCE_OWNER_REQUIRED'; END IF;
  saved := public.attendance_insert_punch(emp, p_at, 'manual', p_kind, NULL, NULL, NULL, p_reason, caller);
  RETURN saved.id;
END $$;

CREATE OR REPLACE FUNCTION public.request_attendance_correction(
  p_store_id uuid, p_employee_id uuid, p_action text, p_target_punch_id uuid, p_kind text, p_time timestamptz, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); emp public.employees; target public.attendance_punches; partner public.attendance_punches; saved uuid;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  SELECT * INTO emp FROM public.employees WHERE id = p_employee_id AND store_id = p_store_id AND is_active FOR KEY SHARE;
  IF NOT FOUND OR NOT public.is_store_active(p_store_id) THEN RAISE EXCEPTION 'ATTENDANCE_NOT_EMPLOYEE'; END IF;
  IF emp.user_id IS DISTINCT FROM caller AND NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
  -- 가입 대기·거절 계정은 본인 정정 요청 불가(관리자는 매장 관리 권한으로 요청 가능)
  IF NOT public.is_store_admin(p_store_id) AND NOT public.attendance_member_approved(p_store_id, caller) THEN
    RAISE EXCEPTION 'ATTENDANCE_NOT_EMPLOYEE';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance_punch:' || emp.id::text, 0));
  IF p_action NOT IN ('add', 'change', 'void') THEN RAISE EXCEPTION 'ATTENDANCE_INPUT_INVALID'; END IF;
  IF p_time IS NOT NULL AND p_time > now() + interval '5 minutes' THEN RAISE EXCEPTION 'ATTENDANCE_INPUT_INVALID'; END IF;
  IF p_action = 'add' AND (p_kind NOT IN ('clock_in', 'clock_out') OR p_kind IS NULL OR p_time IS NULL) THEN RAISE EXCEPTION 'ATTENDANCE_INPUT_INVALID'; END IF;
  IF p_action = 'change' AND p_time IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_INPUT_INVALID'; END IF;
  IF p_time IS NOT NULL AND p_time < now() - interval '1 year' THEN RAISE EXCEPTION 'ATTENDANCE_INPUT_INVALID'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'ATTENDANCE_REASON_REQUIRED'; END IF;
  IF (SELECT count(*) FROM public.attendance_correction_requests WHERE employee_id = emp.id AND status = 'pending') >= 10 THEN
    RAISE EXCEPTION 'ATTENDANCE_CORRECTION_RATE_LIMIT';
  END IF;
  IF p_action IN ('change', 'void') THEN
    SELECT * INTO target FROM public.attendance_effective_punches WHERE id = p_target_punch_id AND employee_id = emp.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_TARGET_INVALID'; END IF;
  END IF;
  partner := public.attendance_validate_correction_order(emp.id,p_action,target.id,coalesce(p_kind,target.kind),p_time);
  IF EXISTS (SELECT 1 FROM public.attendance_correction_requests WHERE target_punch_id = p_target_punch_id AND status = 'pending' AND p_target_punch_id IS NOT NULL) THEN
    RAISE EXCEPTION 'ATTENDANCE_CORRECTION_PENDING';
  END IF;
  INSERT INTO public.attendance_correction_requests(store_id, employee_id, action, target_punch_id, kind, requested_time,
    reason, original_snapshot, requested_by)
  VALUES (p_store_id, emp.id, p_action, CASE WHEN p_action = 'add' THEN NULL ELSE target.id END,
    CASE WHEN p_action = 'add' THEN p_kind ELSE coalesce(p_kind, target.kind) END,
    CASE WHEN p_action = 'void' THEN NULL ELSE p_time END,
    btrim(coalesce(p_reason, '')),
    CASE WHEN target.id IS NULL THEN NULL ELSE jsonb_build_object('punch_id', target.id, 'kind', target.kind,
      'punched_at', target.punched_at, 'work_date', target.work_date, 'source', target.source, 'paired_original', CASE WHEN partner.id IS NULL THEN NULL ELSE
        jsonb_build_object('punch_id',partner.id,'kind',partner.kind,'punched_at',partner.punched_at,'work_date',partner.work_date) END) END,
    caller)
  RETURNING id INTO saved;
  RETURN saved;
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
    INSERT INTO public.attendance_punches(store_id, employee_id, kind, punched_at, work_date, source, is_void, supersedes_id, flags, note, created_by)
    VALUES (target.store_id, target.employee_id, coalesce(req.kind, target.kind),
      CASE WHEN req.action = 'void' THEN target.punched_at ELSE req.requested_time END,
      CASE WHEN req.action = 'void' THEN target.work_date
           WHEN coalesce(req.kind,target.kind)='clock_out' AND partner.kind='clock_in' THEN partner.work_date
           ELSE public.attendance_work_date(target.employee_id, coalesce(req.kind, target.kind), req.requested_time, target.id) END,
      'correction', req.action = 'void', target.id, '{}', note, caller)
    RETURNING * INTO saved;
  END IF;
  -- 출근 날짜가 바뀌면 원래 짝 퇴근의 시각을 보존한 시스템 정정을 원자적으로 추가한다.
  IF req.action='change' AND target.kind='clock_in' AND saved.kind='clock_in'
     AND partner.kind='clock_out' AND partner.work_date IS DISTINCT FROM saved.work_date THEN
    INSERT INTO public.attendance_punches(store_id,employee_id,kind,punched_at,work_date,source,supersedes_id,flags,note,created_by)
    VALUES (partner.store_id,partner.employee_id,partner.kind,partner.punched_at,saved.work_date,'correction',partner.id,'{}',
            '출근 날짜 변경에 따른 퇴근 귀속 정정',caller) RETURNING id INTO paired_saved;
  END IF;
  UPDATE public.attendance_correction_requests SET status = 'approved', reviewed_by = caller, reviewed_at = now(),
    review_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500), applied_punch_id = saved.id, paired_applied_punch_id=paired_saved,
    original_snapshot=CASE WHEN paired_saved IS NULL THEN original_snapshot ELSE coalesce(original_snapshot,'{}'::jsonb) ||
      jsonb_build_object('paired_before_apply',jsonb_build_object('punch_id',partner.id,'kind',partner.kind,
        'punched_at',partner.punched_at,'work_date',partner.work_date)) END WHERE id = req.id;
  RETURN saved.id;
END $$;

COMMIT;
