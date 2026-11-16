-- QR 출퇴근 보정 (2026-11-16, 20261116120000_qr_attendance.sql 원격 적용 후 독립 리뷰 반영)
-- 1) 가입 대기·거절 계정 차단: 기기 등록·스캔·본인 정정 요청에서 승인된 매장 멤버십(또는 매장 소유자)을 확인
-- 2) 최대 길이(500자) 사유의 정정 승인이 note 길이 제한으로 실패하던 문제
-- 3) 60초 중복 처리한 QR을 다시 보내면 처음 돌려준 기록을 그대로 반환(nonce ↔ punch 연결)
-- 기존 함수는 CREATE OR REPLACE로 교체하므로 실행 권한(GRANT)은 그대로 유지된다.
BEGIN;

-- 승인된 매장 멤버십: is_store_member와 같은 기준(소유자 또는 store_members.status = 'approved', 삭제 대기 매장 제외)
CREATE OR REPLACE FUNCTION public.attendance_member_approved(p_store_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.owner_id = p_user_id AND s.deleted_at IS NULL
    UNION ALL
    SELECT 1 FROM public.store_members m JOIN public.stores s ON s.id = m.store_id AND s.deleted_at IS NULL
    WHERE m.store_id = p_store_id AND m.user_id = p_user_id AND m.status = 'approved'
  );
$$;
REVOKE ALL ON FUNCTION public.attendance_member_approved(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 이 QR에 돌려준 기록(새 기록 또는 60초 중복 처리로 반환한 기존 기록)
ALTER TABLE private.attendance_qr_nonces ADD COLUMN IF NOT EXISTS punch_id uuid;
UPDATE private.attendance_qr_nonces q SET punch_id = p.id
FROM public.attendance_punches p WHERE p.qr_nonce = q.nonce AND q.punch_id IS NULL;

CREATE OR REPLACE FUNCTION public.attendance_active_employee(p_store_id uuid, p_user_id uuid)
RETURNS public.employees LANGUAGE sql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
  SELECT e.* FROM public.employees e
  WHERE e.store_id = p_store_id AND e.user_id = p_user_id AND e.is_active
    AND public.attendance_member_approved(p_store_id, p_user_id)
  ORDER BY e.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.register_attendance_device(p_label text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); had_any boolean; dev public.attendance_devices; v_secret bytea := gen_random_bytes(32);
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = caller AND e.is_active AND public.is_store_active(e.store_id)
                   AND public.attendance_member_approved(e.store_id, caller)) THEN
    RAISE EXCEPTION 'ATTENDANCE_EMPLOYEE_REQUIRED';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance_device:' || caller::text, 0));
  IF (SELECT count(*) FROM public.attendance_devices WHERE user_id = caller AND requested_at > now() - interval '1 day') >= 5 THEN
    RAISE EXCEPTION 'ATTENDANCE_DEVICE_RATE_LIMIT';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.attendance_devices WHERE user_id = caller) INTO had_any;
  UPDATE public.attendance_devices SET status = 'revoked', revoked_at = now(), revoked_by = caller, revoked_reason = '새 기기 등록 요청으로 대체'
  WHERE user_id = caller AND status = 'pending';
  INSERT INTO public.attendance_devices(user_id, label, status, activated_at, activated_by)
  VALUES (caller, left(btrim(coalesce(p_label, '')), 60),
          CASE WHEN had_any THEN 'pending' ELSE 'active' END,
          CASE WHEN had_any THEN NULL ELSE now() END,
          CASE WHEN had_any THEN NULL ELSE caller END)
  RETURNING * INTO dev;
  INSERT INTO private.attendance_device_secrets(device_id, secret) VALUES (dev.id, v_secret);
  RETURN jsonb_build_object('device_id', dev.id, 'status', dev.status, 'secret', encode(v_secret, 'base64'));
END $$;

CREATE OR REPLACE FUNCTION public.punch_attendance(p_scanner_token text, p_qr text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE s public.attendance_scanners; parts text[]; dev_id uuid; n text; sig text;
  rec record; dev public.attendance_devices; v_secret bytea; emp public.employees; existing public.attendance_punches;
  saved public.attendance_punches; recent public.attendance_punches; extra text[] := '{}'; at_time timestamptz;
BEGIN
  SELECT * INTO s FROM public.attendance_scanners WHERE token_hash = digest(coalesce(p_scanner_token, ''), 'sha256');
  IF NOT FOUND OR s.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_INVALID'; END IF;
  IF NOT public.is_store_active(s.store_id) THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_INVALID'; END IF;

  parts := regexp_match(coalesce(p_qr, ''),
    '^rattle-punch:v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{24})\.([0-9a-f]{32})$');
  IF parts IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_QR_INVALID'; END IF;
  dev_id := parts[1]::uuid; n := parts[2]; sig := parts[3];

  -- 서명 먼저 검증한다(서명 없이 nonce 존재·만료 여부를 구분할 수 없게).
  SELECT * INTO rec FROM private.attendance_qr_nonces WHERE nonce = n AND device_id = dev_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_QR_INVALID'; END IF;
  SELECT d.secret INTO v_secret FROM private.attendance_device_secrets d WHERE d.device_id = dev_id;
  IF v_secret IS NULL OR encode(substring(hmac(convert_to(dev_id::text || '.' || n, 'UTF8'), v_secret, 'sha256') FROM 1 FOR 16), 'hex') <> sig THEN
    RAISE EXCEPTION 'ATTENDANCE_QR_INVALID';
  END IF;

  -- 같은 QR 재제출(응답 유실 재시도): 이 QR에 처음 돌려준 기록을 그대로 반환(새 기록·중복 처리 모두)
  IF rec.punch_id IS NOT NULL THEN
    SELECT * INTO existing FROM public.attendance_punches WHERE id = rec.punch_id;
  ELSE
    SELECT * INTO existing FROM public.attendance_punches WHERE qr_nonce = n;
  END IF;
  IF FOUND THEN
    IF existing.store_id <> s.store_id THEN RAISE EXCEPTION 'ATTENDANCE_QR_INVALID'; END IF;
    RETURN jsonb_build_object('punch_id', existing.id, 'kind', existing.kind, 'punched_at', existing.punched_at,
      'flags', to_jsonb(existing.flags), 'duplicate', true,
      'employee_name', (SELECT left(name, 1) || repeat('*', greatest(char_length(name) - 1, 0)) FROM public.employees WHERE id = existing.employee_id));
  END IF;
  IF rec.used_at IS NULL AND rec.expires_at < clock_timestamp() THEN RAISE EXCEPTION 'ATTENDANCE_QR_EXPIRED'; END IF;

  SELECT * INTO dev FROM public.attendance_devices WHERE id = dev_id FOR UPDATE;
  IF dev.status <> 'active' THEN RAISE EXCEPTION 'ATTENDANCE_DEVICE_INACTIVE'; END IF;

  emp := public.attendance_active_employee(s.store_id, dev.user_id);
  IF emp.id IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_NOT_EMPLOYEE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance_punch:' || emp.id::text, 0));
  at_time := clock_timestamp();

  -- 짧은 간격 중복 스캔(연속 스캔·응답 유실 재시도): 60초 안의 '스캔' 기록이 있으면 새로 만들지 않음
  SELECT * INTO recent FROM public.attendance_effective_punches
  WHERE employee_id = emp.id AND source = 'scan' AND punched_at BETWEEN at_time - interval '60 seconds' AND at_time
  ORDER BY punched_at DESC LIMIT 1;
  IF NOT FOUND AND rec.used_at IS NOT NULL THEN RAISE EXCEPTION 'ATTENDANCE_QR_INVALID'; END IF;
  IF FOUND THEN
    UPDATE private.attendance_qr_nonces SET used_at = at_time, punch_id = recent.id WHERE nonce = n;
    RETURN jsonb_build_object('punch_id', recent.id, 'kind', recent.kind, 'punched_at', recent.punched_at,
      'flags', to_jsonb(recent.flags), 'duplicate', true,
      'employee_name', left(emp.name, 1) || repeat('*', greatest(char_length(emp.name) - 1, 0)));
  END IF;

  -- 기기 변경 승인(관리자 승인으로 활성화된 기기)의 첫 기록만 확인 필요로 표시
  IF dev.first_punch_at IS NULL THEN
    IF dev.activated_by IS DISTINCT FROM dev.user_id THEN extra := ARRAY['new_device']; END IF;
    UPDATE public.attendance_devices SET first_punch_at = at_time WHERE id = dev.id;
  END IF;
  saved := public.attendance_insert_punch(emp, at_time, 'scan', NULL, s.id, dev.id, n, NULL, NULL, NULL, false, extra);
  UPDATE private.attendance_qr_nonces SET used_at = at_time, punch_id = saved.id WHERE nonce = n;
  IF s.last_seen_at IS NULL OR s.last_seen_at < at_time - interval '1 minute' THEN
    UPDATE public.attendance_scanners SET last_seen_at = at_time WHERE id = s.id;
  END IF;
  RETURN jsonb_build_object('punch_id', saved.id, 'kind', saved.kind, 'punched_at', saved.punched_at,
    'flags', to_jsonb(saved.flags), 'duplicate', false,
    'employee_name', left(emp.name, 1) || repeat('*', greatest(char_length(emp.name) - 1, 0)));
END $$;

CREATE OR REPLACE FUNCTION public.request_attendance_correction(
  p_store_id uuid, p_employee_id uuid, p_action text, p_target_punch_id uuid, p_kind text, p_time timestamptz, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); emp public.employees; target public.attendance_punches; saved uuid;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  SELECT * INTO emp FROM public.employees WHERE id = p_employee_id AND store_id = p_store_id AND is_active;
  IF NOT FOUND OR NOT public.is_store_active(p_store_id) THEN RAISE EXCEPTION 'ATTENDANCE_NOT_EMPLOYEE'; END IF;
  IF emp.user_id IS DISTINCT FROM caller AND NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
  -- 가입 대기·거절 계정은 본인 정정 요청 불가(관리자는 매장 관리 권한으로 요청 가능)
  IF NOT public.is_store_admin(p_store_id) AND NOT public.attendance_member_approved(p_store_id, caller) THEN
    RAISE EXCEPTION 'ATTENDANCE_NOT_EMPLOYEE';
  END IF;
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
      'punched_at', target.punched_at, 'work_date', target.work_date, 'source', target.source) END,
    caller)
  RETURNING id INTO saved;
  RETURN saved;
END $$;

CREATE OR REPLACE FUNCTION public.review_attendance_correction(p_request_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); req public.attendance_correction_requests; emp public.employees;
  target public.attendance_punches; saved public.attendance_punches; note text;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  SELECT * INTO req FROM public.attendance_correction_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR req.status <> 'pending' THEN RAISE EXCEPTION 'ATTENDANCE_CORRECTION_NOT_PENDING'; END IF;
  IF NOT public.is_store_admin(req.store_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
  IF NOT p_approve THEN
    UPDATE public.attendance_correction_requests SET status = 'rejected', reviewed_by = caller, reviewed_at = now(),
      review_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500) WHERE id = req.id;
    RETURN NULL;
  END IF;
  SELECT * INTO emp FROM public.employees WHERE id = req.employee_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance_punch:' || emp.id::text, 0));
  note := left('정정 승인: ' || req.reason, 500); -- 요청 원문(최대 500자)은 요청 행에 그대로 보존
  IF req.action = 'add' THEN
    saved := public.attendance_insert_punch(emp, req.requested_time, 'correction', req.kind, NULL, NULL, NULL, note, caller);
  ELSE
    SELECT * INTO target FROM public.attendance_effective_punches WHERE id = req.target_punch_id;
    IF NOT FOUND THEN
      -- 대상이 이미 다른 정정으로 바뀐 경우: 요청을 자동 반려(대기로 남지 않게)
      UPDATE public.attendance_correction_requests SET status = 'rejected', reviewed_by = caller, reviewed_at = now(),
        review_note = '대상 기록이 이미 변경되어 자동 반려' WHERE id = req.id;
      RETURN NULL;
    END IF;
    INSERT INTO public.attendance_punches(store_id, employee_id, kind, punched_at, work_date, source, is_void, supersedes_id, flags, note, created_by)
    VALUES (target.store_id, target.employee_id, coalesce(req.kind, target.kind),
      CASE WHEN req.action = 'void' THEN target.punched_at ELSE req.requested_time END,
      CASE WHEN req.action = 'void' THEN target.work_date
           ELSE public.attendance_work_date(target.employee_id, coalesce(req.kind, target.kind), req.requested_time, target.id) END,
      'correction', req.action = 'void', target.id, '{}', note, caller)
    RETURNING * INTO saved;
  END IF;
  UPDATE public.attendance_correction_requests SET status = 'approved', reviewed_by = caller, reviewed_at = now(),
    review_note = left(nullif(btrim(coalesce(p_note, '')), ''), 500), applied_punch_id = saved.id WHERE id = req.id;
  RETURN saved.id;
END $$;

COMMIT;
