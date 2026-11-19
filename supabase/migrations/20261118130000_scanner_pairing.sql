-- 로그인 없는 매장폰 등록 / 사용자 결정 2026-11-18.
-- 선행: 20261118120000_qr_attendance_daily_work.sql (이전 QR/역할 체인 포함).
-- 적용: 전체 BEGIN/COMMIT, 원격 미적용. 실패 시 ROLLBACK; 이후 복구는 새 보정 파일.
-- 기존 토큰은 유지. 예전 로그인 기반 등록 RPC는 차단; 등록 QR/스캐너 토큰을 로그에 남기지 않는다.
BEGIN;
CREATE TABLE private.attendance_scanner_pairings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 nonce_hash bytea NOT NULL UNIQUE,
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 40),
 issued_by uuid NOT NULL,
 owner_id uuid NOT NULL,
 manager_revision bigint NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 invalidated_at timestamptz,
 scanner_id uuid REFERENCES public.attendance_scanners(id) ON DELETE SET NULL
);
CREATE INDEX attendance_scanner_pairings_store_time ON private.attendance_scanner_pairings(store_id,issued_at);
CREATE TABLE private.attendance_scanner_pairing_limits (
 store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
 window_start timestamptz NOT NULL,
 attempts integer NOT NULL CHECK(attempts>0)
);
ALTER TABLE private.attendance_scanner_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.attendance_scanner_pairing_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.attendance_scanner_pairings,private.attendance_scanner_pairing_limits FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.scanner_pairing_issuer_allowed(p private.attendance_scanner_pairings) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.stores s JOIN auth.users u ON u.id=p.issued_by WHERE s.id=p.store_id AND s.deleted_at IS NULL AND
  ((p.issued_by=p.owner_id AND s.owner_id=p.issued_by) OR
   EXISTS(SELECT 1 FROM private.store_managers sm
    JOIN public.store_members m ON m.id=sm.member_id AND m.store_id=sm.store_id
    JOIN public.employees e ON e.id=sm.employee_id AND e.store_id=sm.store_id
    WHERE sm.store_id=s.id AND s.owner_id<>sm.user_id AND sm.user_id=p.issued_by AND sm.revision=p.manager_revision
      AND m.user_id=p.issued_by AND m.status='approved' AND e.user_id=p.issued_by AND e.is_active)));
$$;
CREATE FUNCTION public.issue_attendance_scanner_registration(p_store_id uuid,p_label text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,extensions,public,private,pg_temp AS $$
DECLARE sid_owner uuid; revision bigint; token text; pairing private.attendance_scanner_pairings; access jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 -- Store -> manager state -> store pairing advisory -> nonce. Same order is used during exchange.
 SELECT owner_id INTO sid_owner FROM public.stores WHERE id=p_store_id AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 SELECT sm.revision INTO revision FROM private.store_managers sm WHERE sm.store_id=p_store_id FOR SHARE;
 access:=public.get_my_store_access(p_store_id);
 IF NOT coalesce((access->>'can_manage_store')::boolean,false) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_label,''))) NOT BETWEEN 1 AND 40 THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_LABEL_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('scanner_pairing:'||p_store_id::text,0));
 IF (SELECT count(*) FROM private.attendance_scanner_pairings WHERE store_id=p_store_id AND issued_at>clock_timestamp()-interval '10 minutes')>=5
  THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_REGISTRATION_RATE_LIMIT'; END IF;
 -- A new QR supersedes previous outstanding registrations for this store.
 UPDATE private.attendance_scanner_pairings SET invalidated_at=clock_timestamp()
  WHERE store_id=p_store_id AND consumed_at IS NULL AND invalidated_at IS NULL;
 DELETE FROM private.attendance_scanner_pairings WHERE store_id=p_store_id AND expires_at<clock_timestamp()-interval '1 day';
 token:=encode(gen_random_bytes(32),'hex');
 INSERT INTO private.attendance_scanner_pairings(store_id,nonce_hash,label,issued_by,owner_id,manager_revision,expires_at)
 VALUES(p_store_id,digest(token,'sha256'),btrim(p_label),auth.uid(),sid_owner,coalesce(revision,0),clock_timestamp()+interval '2 minutes') RETURNING * INTO pairing;
 RETURN jsonb_build_object('registration_id',pairing.id,'store_id',p_store_id,'expires_at',pairing.expires_at,
  'registration_qr','rattle-scanner:v1.'||p_store_id::text||'.'||token);
END $$;

-- Denials return JSON instead of throwing, so throttling counters commit on invalid/expired/replayed exchanges.
-- The random 256-bit bearer nonce is stored hashed. No JWT/session is accepted as pairing authority.
CREATE FUNCTION public.exchange_attendance_scanner_registration(p_store_id uuid,p_registration_qr text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,extensions,public,private,pg_temp AS $$
DECLARE parts text[]; qr_store uuid; pairing private.attendance_scanner_pairings; saved public.attendance_scanners;
 token text; n integer; at_time timestamptz;
BEGIN
 IF p_registration_qr IS NULL OR octet_length(p_registration_qr)>180 THEN
  RETURN jsonb_build_object('ok',false,'error_code','ATTENDANCE_SCANNER_REGISTRATION_INVALID'); END IF;
 parts:=regexp_match(p_registration_qr,'^rattle-scanner:v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$');
 IF parts IS NULL THEN RETURN jsonb_build_object('ok',false,'error_code','ATTENDANCE_SCANNER_REGISTRATION_INVALID'); END IF;
 qr_store:=parts[1]::uuid;
 PERFORM 1 FROM public.stores WHERE id=qr_store AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error_code','ATTENDANCE_SCANNER_REGISTRATION_INVALID'); END IF;
 PERFORM 1 FROM private.store_managers WHERE store_id=qr_store FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtextextended('scanner_pairing:'||qr_store::text,0));
 at_time:=clock_timestamp();
 INSERT INTO private.attendance_scanner_pairing_limits(store_id,window_start,attempts) VALUES(qr_store,at_time,1)
 ON CONFLICT(store_id) DO UPDATE SET
  attempts=CASE WHEN attendance_scanner_pairing_limits.window_start<=at_time-interval '1 minute' THEN 1 ELSE least(21,attendance_scanner_pairing_limits.attempts+1) END,
  window_start=CASE WHEN attendance_scanner_pairing_limits.window_start<=at_time-interval '1 minute' THEN at_time ELSE attendance_scanner_pairing_limits.window_start END
 RETURNING attempts INTO n;
 IF n>20 THEN RETURN jsonb_build_object('ok',false,'error_code','ATTENDANCE_SCANNER_REGISTRATION_RATE_LIMIT'); END IF;
 IF p_store_id IS DISTINCT FROM qr_store THEN RETURN jsonb_build_object('ok',false,'error_code','ATTENDANCE_SCANNER_REGISTRATION_INVALID'); END IF;
 SELECT * INTO pairing FROM private.attendance_scanner_pairings WHERE store_id=qr_store AND nonce_hash=digest(parts[2],'sha256') FOR UPDATE;
 IF NOT FOUND OR pairing.invalidated_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error_code','ATTENDANCE_SCANNER_REGISTRATION_INVALID'); END IF;
 IF pairing.consumed_at IS NOT NULL THEN RETURN jsonb_build_object('ok',false,'error_code','ATTENDANCE_SCANNER_REGISTRATION_USED'); END IF;
 IF pairing.expires_at<clock_timestamp() THEN RETURN jsonb_build_object('ok',false,'error_code','ATTENDANCE_SCANNER_REGISTRATION_EXPIRED'); END IF;
 IF NOT private.scanner_pairing_issuer_allowed(pairing) THEN
  RETURN jsonb_build_object('ok',false,'error_code','ATTENDANCE_SCANNER_REGISTRATION_FORBIDDEN'); END IF;
 token:=encode(gen_random_bytes(32),'hex');
 INSERT INTO public.attendance_scanners(store_id,label,token_hash,created_by)
 VALUES(pairing.store_id,pairing.label,digest(token,'sha256'),pairing.issued_by) RETURNING * INTO saved;
 UPDATE private.attendance_scanner_pairings SET consumed_at=clock_timestamp(),scanner_id=saved.id WHERE id=pairing.id;
 RETURN jsonb_build_object('ok',true,'scanner_id',saved.id,'store_id',saved.store_id,'token',token);
END $$;

CREATE OR REPLACE FUNCTION public.register_attendance_scanner(p_store_id uuid,p_label text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'ATTENDANCE_SCANNER_REGISTRATION_REQUIRED' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.register_attendance_scanner(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.scanner_pairing_issuer_allowed(private.attendance_scanner_pairings),
 public.issue_attendance_scanner_registration(uuid,text),public.exchange_attendance_scanner_registration(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.issue_attendance_scanner_registration(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_attendance_scanner_registration(uuid,text) TO anon,authenticated;
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
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_INVALID'; END IF;
  IF s.revoked_at IS NOT NULL OR NOT public.is_store_active(s.store_id) THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_REVOKED'; END IF;
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
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_INVALID'; END IF;
  IF s.revoked_at IS NOT NULL OR NOT public.is_store_active(s.store_id) THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_REVOKED'; END IF;

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


NOTIFY pgrst,'reload schema';
COMMIT;
