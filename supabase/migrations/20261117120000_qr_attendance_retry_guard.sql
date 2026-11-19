-- QR 출퇴근 재리뷰 보정 (2026-11-17)
-- 이미 처리한 QR(nonce.used_at 있음)의 대상 기록이 사라졌으면 명시적으로 거절한다.
-- 다른 기록(최근 60초 스캔 등)으로 다시 연결하거나 nonce의 punch_id를 덮어쓰지 않는다.
-- 20261116120000_qr_attendance.sql, 20261116130000_qr_attendance_fixes.sql 적용 후 실행한다.

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
  -- 이미 처리한 QR인데 대상 기록이 없으면(삭제 등) 거절. 다른 기록으로 다시 연결하지 않는다.
  IF rec.used_at IS NOT NULL THEN RAISE EXCEPTION 'ATTENDANCE_QR_INVALID'; END IF;
  IF rec.expires_at < clock_timestamp() THEN RAISE EXCEPTION 'ATTENDANCE_QR_EXPIRED'; END IF;

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
