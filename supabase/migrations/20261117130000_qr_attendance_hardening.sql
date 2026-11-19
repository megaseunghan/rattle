-- QR 출퇴근 보안/동시성 보정 (2026-11-17, S43~S46)
-- 근거: docs/QR-출퇴근-앱화면-인수인계-2026-11-16.md 및 설계안 9장.
-- 선행/순서: 20261116120000_qr_attendance.sql → 20261116130000_qr_attendance_fixes.sql
--          → 20261117120000_qr_attendance_retry_guard.sql → 이 파일.
-- RPC 인자/반환/기존 오류 코드/실행 권한 유지. 정책 결정 대기 항목은 변경하지 않는다.
-- 복구: COMMIT 전 실패는 전체 롤백. 적용 후에는 새 보정 migration으로 필요한 함수/트리거만 복원한다.
-- 자동 해제된 기기를 active로 되돌리거나 지운 nonce를 재생성하지 않는다(재등록/관리자 승인 필요).
-- 정의 복원 기준: register=fixes, issue/scanner_status/trigger=초기본, punch=retry_guard.
-- 과거 migration 전체 재실행은 테이블/정책 재생성을 포함하므로 복구 방법으로 쓰지 않는다.
-- anon 호출 횟수 제한은 별도 운영 게이트웨이 점검 대상이며 이 파일에 추가하지 않는다.
BEGIN;

-- 등록/승인과 같은 순서: 사용자 advisory lock → 기기 행 갱신.
-- AFTER이므로 삭제/재연결 후의 관계를 OLD.user_id 기준으로 다시 확인한다.
CREATE OR REPLACE FUNCTION public.revoke_attendance_devices_on_resign() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (OLD.is_active, OLD.user_id) IS NOT DISTINCT FROM (NEW.is_active, NEW.user_id) THEN RETURN NEW; END IF;
  END IF;
  IF OLD.user_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('attendance_device:' || OLD.user_id::text, 0));
    IF NOT EXISTS (SELECT 1 FROM public.employees e
                   WHERE e.user_id = OLD.user_id AND e.is_active AND public.is_store_active(e.store_id)) THEN
      UPDATE public.attendance_devices
      SET status = 'revoked', revoked_at = now(), revoked_reason = '재직 관계 종료로 자동 해제'
      WHERE user_id = OLD.user_id AND status IN ('pending', 'active');
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS revoke_attendance_devices_on_resign ON public.employees;
CREATE TRIGGER revoke_attendance_devices_on_resign
  AFTER DELETE OR UPDATE OF is_active, user_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.revoke_attendance_devices_on_resign();

CREATE OR REPLACE FUNCTION public.register_attendance_device(p_label text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); had_any boolean; dev public.attendance_devices; v_secret bytea := gen_random_bytes(32);
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance_device:' || caller::text, 0));
  -- 재직 확인도 사용자 잠금 안에서 수행: 삭제/퇴사 후 대기 중이던 등록이 활성 기기를 만들지 않게 한다.
  IF NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = caller AND e.is_active AND public.is_store_active(e.store_id)
                   AND public.attendance_member_approved(e.store_id, caller)) THEN
    RAISE EXCEPTION 'ATTENDANCE_EMPLOYEE_REQUIRED';
  END IF;
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

-- 기기별 발급 잠금 안에서 개수 검사/발급/정리. 해제와 경합해 발급된 nonce도 스캔 시 활성 상태 재확인.
-- 기기 행 FOR UPDATE는 쓰지 않는다: punch의 nonce → 기기 행 잠금과 순환하지 않게 한다.
CREATE OR REPLACE FUNCTION public.issue_attendance_qr(p_device_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); dev public.attendance_devices; n text; expires timestamptz; at_time timestamptz;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance_qr:' || p_device_id::text, 0));
  SELECT * INTO dev FROM public.attendance_devices WHERE id = p_device_id AND user_id = caller;
  IF NOT FOUND OR dev.status <> 'active' THEN RAISE EXCEPTION 'ATTENDANCE_DEVICE_INACTIVE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees e
                 WHERE e.user_id = caller AND e.is_active AND public.is_store_active(e.store_id)
                   AND public.attendance_member_approved(e.store_id, caller)) THEN
    RAISE EXCEPTION 'ATTENDANCE_EMPLOYEE_REQUIRED';
  END IF;
  at_time := clock_timestamp();
  -- 같은 QR 재시도 기간 유지: 만료 후 1시간 지난 호출자 기기의 nonce만 삭제한다.
  DELETE FROM private.attendance_qr_nonces WHERE device_id = dev.id AND expires_at < at_time - interval '1 hour';
  IF (SELECT count(*) FROM private.attendance_qr_nonces
      WHERE device_id = dev.id AND used_at IS NULL AND expires_at > at_time) >= 5 THEN
    RAISE EXCEPTION 'ATTENDANCE_QR_RATE_LIMIT';
  END IF;
  n := encode(gen_random_bytes(12), 'hex');
  expires := at_time + interval '45 seconds';
  INSERT INTO private.attendance_qr_nonces(nonce, device_id, issued_at, expires_at) VALUES (n, dev.id, at_time, expires);
  RETURN jsonb_build_object('nonce', n, 'expires_at', expires);
END $$;

CREATE OR REPLACE FUNCTION public.attendance_scanner_status(p_scanner_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE s public.attendance_scanners; store_name text;
BEGIN
  -- 고정 32바이트 hex 토큰: 해시 계산/조회 전에 길이부터 제한한다.
  IF p_scanner_token IS NULL OR octet_length(p_scanner_token) <> 64 THEN
    RAISE EXCEPTION 'ATTENDANCE_SCANNER_INVALID';
  END IF;
  IF p_scanner_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_INVALID'; END IF;
  SELECT * INTO s FROM public.attendance_scanners WHERE token_hash = digest(coalesce(p_scanner_token, ''), 'sha256');
  IF NOT FOUND OR s.revoked_at IS NOT NULL OR NOT public.is_store_active(s.store_id) THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_INVALID'; END IF;
  SELECT name INTO store_name FROM public.stores WHERE id = s.store_id;
  RETURN jsonb_build_object('scanner_id', s.id, 'store_name', store_name, 'label', s.label);
END $$;

CREATE OR REPLACE FUNCTION public.punch_attendance(p_scanner_token text, p_qr text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE s public.attendance_scanners; parts text[]; dev_id uuid; n text; sig text;
  rec record; dev public.attendance_devices; v_secret bytea; emp public.employees; existing public.attendance_punches;
  saved public.attendance_punches; recent public.attendance_punches; extra text[] := '{}'; at_time timestamptz;
BEGIN
  -- 고정 32바이트 hex 토큰: 해시 계산/조회 전에 길이부터 제한한다.
  IF p_scanner_token IS NULL OR octet_length(p_scanner_token) <> 64 THEN
    RAISE EXCEPTION 'ATTENDANCE_SCANNER_INVALID';
  END IF;
  IF p_scanner_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_INVALID'; END IF;
  -- 정규식도 최대 110바이트 입력에만 실행하고, 어떤 해시/테이블 조회보다 먼저 거절한다.
  IF p_qr IS NULL OR octet_length(p_qr) <> 110 THEN RAISE EXCEPTION 'ATTENDANCE_QR_INVALID'; END IF;
  parts := regexp_match(coalesce(p_qr, ''),
    '^rattle-punch:v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{24})\.([0-9a-f]{32})$');
  IF parts IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_QR_INVALID'; END IF;
  SELECT * INTO s FROM public.attendance_scanners WHERE token_hash = digest(coalesce(p_scanner_token, ''), 'sha256');
  IF NOT FOUND OR s.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_INVALID'; END IF;
  IF NOT public.is_store_active(s.store_id) THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_INVALID'; END IF;

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

  -- DELETE는 직원 행 → 기기 행 순서다. FK INSERT 직전에 직원을 기다리지 않도록
  -- 먼저 직원 KEY SHARE를 잡은 뒤 기기 FOR UPDATE를 잡는다(기기 선행 잠금 금지).
  SELECT * INTO dev FROM public.attendance_devices WHERE id = dev_id;
  IF NOT FOUND OR dev.status <> 'active' THEN RAISE EXCEPTION 'ATTENDANCE_DEVICE_INACTIVE'; END IF;
  emp := public.attendance_active_employee(s.store_id, dev.user_id);
  IF emp.id IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_NOT_EMPLOYEE'; END IF;
  SELECT e.* INTO emp FROM public.employees e
  WHERE e.id=emp.id AND e.store_id=s.store_id AND e.user_id=dev.user_id AND e.is_active
    AND public.attendance_member_approved(e.store_id,dev.user_id) FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_NOT_EMPLOYEE'; END IF;
  SELECT * INTO dev FROM public.attendance_devices WHERE id = dev_id FOR UPDATE;
  IF NOT FOUND OR dev.status <> 'active' THEN RAISE EXCEPTION 'ATTENDANCE_DEVICE_INACTIVE'; END IF;
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

-- CREATE OR REPLACE는 기존 ACL을 보존한다. 트리거 함수는 클라이언트 직접 실행 불가.
REVOKE ALL ON FUNCTION public.revoke_attendance_devices_on_resign() FROM PUBLIC, anon, authenticated;
COMMIT;
