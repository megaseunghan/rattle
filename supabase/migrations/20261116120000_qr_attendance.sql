BEGIN;

-- QR 출퇴근 1차 (설계: docs/QR-출퇴근-설계안-2026-11-16.md v2, 9장 우선)
-- - 위치정보(GPS·Wi-Fi·기지국)를 수집하지 않는다.
-- - 직원 폰(등록 기기)이 서버 발급 일회용 값(nonce)으로 QR을 만들고, 매장폰(스캐너)이 스캔해 기록한다.
-- - 출퇴근 원본은 수정하지 않는다. 정정은 승인 시 새 기록(source='correction')으로 쌓는다.
-- - 급여 반영·알림은 2차.
-- 선행: 20261114120000_store_soft_delete.sql (is_store_active, deleted_store_ids, guard_deleted_store_write)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

-- 공통: KST 날짜와 요일
CREATE OR REPLACE FUNCTION public.kst_date(p_at timestamptz) RETURNS date
LANGUAGE sql IMMUTABLE AS $$ SELECT (p_at AT TIME ZONE 'Asia/Seoul')::date $$;

-- 1. 직원 출퇴근 기기 (사람 기준, 여러 매장 공용)
CREATE TABLE public.attendance_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '' CHECK (length(label) <= 60),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  activated_by uuid,
  revoked_at timestamptz,
  revoked_by uuid,
  revoked_reason text CHECK (revoked_reason IS NULL OR length(revoked_reason) <= 200),
  first_punch_at timestamptz,
  CHECK ((status = 'active') = (activated_at IS NOT NULL AND revoked_at IS NULL) OR status <> 'active'),
  CHECK (status <> 'revoked' OR revoked_at IS NOT NULL)
);
CREATE UNIQUE INDEX attendance_devices_one_active ON public.attendance_devices(user_id) WHERE status = 'active';
CREATE INDEX attendance_devices_user ON public.attendance_devices(user_id);
CREATE UNIQUE INDEX attendance_devices_one_pending ON public.attendance_devices(user_id) WHERE status = 'pending';
ALTER TABLE public.attendance_devices ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.attendance_devices TO authenticated;
CREATE POLICY attendance_devices_own_read ON public.attendance_devices FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 기기 비밀키: API 비노출 private 스키마. SECURITY DEFINER 함수만 읽는다.
CREATE TABLE private.attendance_device_secrets (
  device_id uuid PRIMARY KEY REFERENCES public.attendance_devices(id) ON DELETE CASCADE,
  secret bytea NOT NULL CHECK (length(secret) = 32)
);
-- 일회용 QR 값 (직원 폰 온라인 필수 결정)
CREATE TABLE private.attendance_qr_nonces (
  nonce text PRIMARY KEY,
  device_id uuid NOT NULL REFERENCES public.attendance_devices(id) ON DELETE CASCADE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX attendance_qr_nonces_expiry ON private.attendance_qr_nonces(expires_at);
REVOKE ALL ON ALL TABLES IN SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
-- SECURITY DEFINER(소유자 postgres) 함수만 접근. 정책 없는 RLS로 이중 방어.
ALTER TABLE private.attendance_device_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.attendance_qr_nonces ENABLE ROW LEVEL SECURITY;
CREATE INDEX attendance_qr_nonces_device ON private.attendance_qr_nonces(device_id);

-- 2. 매장폰(스캐너) 등록
CREATE TABLE public.attendance_scanners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 40),
  token_hash bytea NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid
);
CREATE INDEX attendance_scanners_store ON public.attendance_scanners(store_id);
ALTER TABLE public.attendance_scanners ENABLE ROW LEVEL SECURITY;
GRANT SELECT (id, store_id, label, created_by, created_at, last_seen_at, revoked_at, revoked_by)
  ON public.attendance_scanners TO authenticated;
CREATE POLICY attendance_scanners_admin_read ON public.attendance_scanners FOR SELECT TO authenticated
  USING (public.is_store_admin(store_id));

-- 3. 출퇴근 원본 (수정 불가)
CREATE TABLE public.attendance_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('clock_in', 'clock_out')),
  punched_at timestamptz NOT NULL,
  work_date date NOT NULL,
  source text NOT NULL CHECK (source IN ('scan', 'manual', 'correction')),
  is_void boolean NOT NULL DEFAULT false,
  supersedes_id uuid REFERENCES public.attendance_punches(id) ON DELETE CASCADE,
  scanner_id uuid REFERENCES public.attendance_scanners(id) ON DELETE SET NULL,
  device_id uuid REFERENCES public.attendance_devices(id) ON DELETE SET NULL,
  qr_nonce text UNIQUE,
  flags text[] NOT NULL DEFAULT '{}',
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source <> 'scan' OR (scanner_id IS NOT NULL OR qr_nonce IS NOT NULL)),
  CHECK (source = 'scan' OR (note IS NOT NULL AND length(btrim(note)) > 0)),
  CHECK (NOT is_void OR supersedes_id IS NOT NULL)
);
CREATE INDEX attendance_punches_employee_time ON public.attendance_punches(employee_id, punched_at DESC);
CREATE INDEX attendance_punches_store_date ON public.attendance_punches(store_id, work_date);
CREATE INDEX attendance_punches_scanner ON public.attendance_punches(scanner_id) WHERE scanner_id IS NOT NULL;
CREATE INDEX attendance_punches_device ON public.attendance_punches(device_id) WHERE device_id IS NOT NULL;
CREATE UNIQUE INDEX attendance_punches_one_successor ON public.attendance_punches(supersedes_id) WHERE supersedes_id IS NOT NULL;
ALTER TABLE public.attendance_punches ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.attendance_punches TO authenticated;
CREATE POLICY attendance_punches_read ON public.attendance_punches FOR SELECT TO authenticated
  USING (public.can_read_employee(store_id, employee_id));

CREATE OR REPLACE FUNCTION public.guard_attendance_punch_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = extensions, public, pg_temp AS $$
BEGIN
  -- FK의 SET NULL(scanner_id, device_id)만 허용한다.
  IF (NEW.store_id, NEW.employee_id, NEW.kind, NEW.punched_at, NEW.work_date, NEW.source, NEW.is_void,
      NEW.supersedes_id, NEW.qr_nonce, NEW.flags, NEW.note, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.store_id, OLD.employee_id, OLD.kind, OLD.punched_at, OLD.work_date, OLD.source, OLD.is_void,
      OLD.supersedes_id, OLD.qr_nonce, OLD.flags, OLD.note, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'ATTENDANCE_PUNCH_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_attendance_punch_immutable BEFORE UPDATE ON public.attendance_punches
  FOR EACH ROW EXECUTE FUNCTION public.guard_attendance_punch_immutable();

-- 정정·무효로 대체되지 않은 유효 기록
CREATE OR REPLACE VIEW public.attendance_effective_punches WITH (security_invoker = true) AS
  SELECT p.* FROM public.attendance_punches p
  WHERE NOT p.is_void
    AND NOT EXISTS (SELECT 1 FROM public.attendance_punches c WHERE c.supersedes_id = p.id);
GRANT SELECT ON public.attendance_effective_punches TO authenticated;

-- 4. 정정 요청 (새 테이블, 결정 4-B)
CREATE TABLE public.attendance_correction_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('add', 'change', 'void')),
  target_punch_id uuid REFERENCES public.attendance_punches(id) ON DELETE SET NULL,
  kind text CHECK (kind IN ('clock_in', 'clock_out')),
  requested_time timestamptz,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  original_snapshot jsonb,
  requested_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text CHECK (review_note IS NULL OR length(review_note) <= 500),
  applied_punch_id uuid REFERENCES public.attendance_punches(id) ON DELETE SET NULL,
  CHECK (action <> 'add' OR (kind IS NOT NULL AND requested_time IS NOT NULL AND target_punch_id IS NULL)),
  CHECK (action <> 'change' OR (requested_time IS NOT NULL)),
  CHECK (status = 'pending' OR status = 'cancelled' OR reviewed_at IS NOT NULL)
);
CREATE INDEX attendance_correction_requests_employee ON public.attendance_correction_requests(employee_id);
CREATE UNIQUE INDEX attendance_correction_requests_one_pending ON public.attendance_correction_requests(target_punch_id)
  WHERE status = 'pending' AND target_punch_id IS NOT NULL;
CREATE INDEX attendance_correction_requests_applied ON public.attendance_correction_requests(applied_punch_id) WHERE applied_punch_id IS NOT NULL;
CREATE INDEX attendance_correction_requests_store_status ON public.attendance_correction_requests(store_id, status, created_at);
ALTER TABLE public.attendance_correction_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.attendance_correction_requests TO authenticated;
CREATE POLICY attendance_correction_requests_read ON public.attendance_correction_requests FOR SELECT TO authenticated
  USING (public.can_read_employee(store_id, employee_id));

-- 5. 삭제 대기 매장 가드 (soft delete 마이그레이션과 같은 규칙을 새 테이블에 직접 적용)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['attendance_scanners', 'attendance_punches', 'attendance_correction_requests'] LOOP
    EXECUTE format('CREATE POLICY deleted_store_guard_store_id ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (store_id IS NULL OR NOT (store_id = ANY (COALESCE((SELECT public.deleted_store_ids()), ''{}''::uuid[])))) WITH CHECK (store_id IS NULL OR NOT (store_id = ANY (COALESCE((SELECT public.deleted_store_ids()), ''{}''::uuid[]))))', t);
    EXECUTE format('CREATE TRIGGER guard_deleted_store_store_id BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_deleted_store_write(%L)', t, 'store_id');
  END LOOP;
END $$;

-- ===== 내부 도우미 =====
CREATE OR REPLACE FUNCTION public.attendance_active_employee(p_store_id uuid, p_user_id uuid)
RETURNS public.employees LANGUAGE sql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
  SELECT e.* FROM public.employees e
  WHERE e.store_id = p_store_id AND e.user_id = p_user_id AND e.is_active
  ORDER BY e.id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.attendance_active_employee(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 호출자가 기기 주인이 근무하는(활성) 매장의 관리자인지
CREATE OR REPLACE FUNCTION public.attendance_can_manage_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.user_id = p_user_id AND e.is_active AND public.is_store_admin(e.store_id)
  );
$$;
REVOKE ALL ON FUNCTION public.attendance_can_manage_user(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.attendance_open_clock_in(p_employee_id uuid)
RETURNS public.attendance_punches LANGUAGE sql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
  SELECT p.* FROM public.attendance_effective_punches p
  WHERE p.employee_id = p_employee_id
  ORDER BY p.punched_at DESC, p.created_at DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.attendance_open_clock_in(uuid) FROM PUBLIC, anon, authenticated;

-- 스케줄 대비 이상 표시 (임시 기준 10분, 설계 2-4)
CREATE OR REPLACE FUNCTION public.attendance_schedule_flags(p_employee_id uuid, p_kind text, p_at timestamptz)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE s public.employee_schedules; local_time time := (p_at AT TIME ZONE 'Asia/Seoul')::time;
BEGIN
  SELECT * INTO s FROM public.employee_schedules
  WHERE employee_id = p_employee_id AND day_of_week = extract(dow FROM p_at AT TIME ZONE 'Asia/Seoul');
  IF NOT FOUND OR NOT s.is_working OR s.start_time IS NULL OR s.end_time IS NULL THEN
    RETURN CASE WHEN p_kind = 'clock_in' THEN ARRAY['no_schedule'] ELSE '{}'::text[] END;
  END IF;
  IF p_kind = 'clock_in' AND local_time < s.start_time - interval '10 minutes' THEN RETURN ARRAY['early_clock_in']; END IF;
  IF p_kind = 'clock_out' AND s.end_time > s.start_time AND local_time > s.end_time + interval '10 minutes' THEN RETURN ARRAY['late_clock_out']; END IF;
  RETURN '{}'::text[];
END $$;
REVOKE ALL ON FUNCTION public.attendance_schedule_flags(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- 날짜 귀속: 출근은 KST 날짜, 퇴근은 그 시각 이전 16시간 안의 마지막 유효 출근의 날짜(야간 근무·뒤늦은 입력 대응)
CREATE OR REPLACE FUNCTION public.attendance_work_date(p_employee_id uuid, p_kind text, p_at timestamptz, p_exclude uuid DEFAULT NULL)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
  SELECT CASE WHEN p_kind = 'clock_out' THEN coalesce((
    SELECT p.work_date FROM public.attendance_effective_punches p
    WHERE p.employee_id = p_employee_id AND p.kind = 'clock_in' AND p.id IS DISTINCT FROM p_exclude
      AND p.punched_at <= p_at AND p.punched_at > p_at - interval '16 hours'
    ORDER BY p.punched_at DESC LIMIT 1), public.kst_date(p_at))
  ELSE public.kst_date(p_at) END;
$$;
REVOKE ALL ON FUNCTION public.attendance_work_date(uuid, text, timestamptz, uuid) FROM PUBLIC, anon, authenticated;

-- 새 기록 삽입 공통: 출근/퇴근 자동 판단(결정 3), 날짜 귀속, 이상 표시
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
      IF last.id IS NOT NULL AND last.kind = 'clock_in' THEN flags := flags || 'previous_open_over_16h'; END IF;
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

-- ===== 직원 기기 =====
CREATE OR REPLACE FUNCTION public.register_attendance_device(p_label text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); had_any boolean; dev public.attendance_devices; v_secret bytea := gen_random_bytes(32);
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = caller AND e.is_active AND public.is_store_active(e.store_id)) THEN
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

CREATE OR REPLACE FUNCTION public.approve_attendance_device(p_device_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); dev public.attendance_devices;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  SELECT * INTO dev FROM public.attendance_devices WHERE id = p_device_id;
  IF NOT FOUND OR dev.status <> 'pending' THEN RAISE EXCEPTION 'ATTENDANCE_DEVICE_NOT_PENDING'; END IF;
  IF NOT public.attendance_can_manage_user(dev.user_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
  -- register와 같은 순서: 사용자 단위 잠금 → 행 잠금
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance_device:' || dev.user_id::text, 0));
  SELECT * INTO dev FROM public.attendance_devices WHERE id = p_device_id FOR UPDATE;
  IF dev.status <> 'pending' THEN RAISE EXCEPTION 'ATTENDANCE_DEVICE_NOT_PENDING'; END IF;
  UPDATE public.attendance_devices SET status = 'revoked', revoked_at = now(), revoked_by = caller, revoked_reason = '새 기기 승인으로 대체'
  WHERE user_id = dev.user_id AND status = 'active';
  UPDATE public.attendance_devices SET status = 'active', activated_at = now(), activated_by = caller WHERE id = dev.id;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_attendance_device(p_device_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); dev public.attendance_devices;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  SELECT * INTO dev FROM public.attendance_devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR dev.status = 'revoked' THEN RAISE EXCEPTION 'ATTENDANCE_DEVICE_NOT_FOUND'; END IF;
  IF dev.user_id <> caller AND NOT public.attendance_can_manage_user(dev.user_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
  UPDATE public.attendance_devices SET status = 'revoked', revoked_at = now(), revoked_by = caller,
    revoked_reason = left(nullif(btrim(coalesce(p_reason, '')), ''), 200)
  WHERE id = dev.id;
END $$;

-- 관리자: 매장 직원들의 기기 목록(비밀키 제외)
CREATE OR REPLACE FUNCTION public.list_store_attendance_devices(p_store_id uuid)
RETURNS TABLE(device_id uuid, employee_id uuid, employee_name text, label text, status text,
              requested_at timestamptz, activated_at timestamptz, first_punch_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
BEGIN
  IF NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
  RETURN QUERY
    SELECT d.id, e.id, e.name, d.label, d.status, d.requested_at, d.activated_at, d.first_punch_at
    FROM public.employees e JOIN public.attendance_devices d ON d.user_id = e.user_id
    WHERE e.store_id = p_store_id AND e.is_active AND d.status IN ('pending', 'active')
    ORDER BY d.status DESC, e.name;
END $$;

-- 직원 폰: QR용 일회용 값 발급 (온라인 필수)
CREATE OR REPLACE FUNCTION public.issue_attendance_qr(p_device_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); dev public.attendance_devices; n text := encode(gen_random_bytes(12), 'hex');
  expires timestamptz := now() + interval '45 seconds';
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  SELECT * INTO dev FROM public.attendance_devices WHERE id = p_device_id AND user_id = caller;
  IF NOT FOUND OR dev.status <> 'active' THEN RAISE EXCEPTION 'ATTENDANCE_DEVICE_INACTIVE'; END IF;
  DELETE FROM private.attendance_qr_nonces WHERE expires_at < now() - interval '1 hour';
  IF (SELECT count(*) FROM private.attendance_qr_nonces WHERE device_id = dev.id AND used_at IS NULL AND expires_at > now()) >= 5 THEN
    RAISE EXCEPTION 'ATTENDANCE_QR_RATE_LIMIT';
  END IF;
  INSERT INTO private.attendance_qr_nonces(nonce, device_id, expires_at) VALUES (n, dev.id, expires);
  RETURN jsonb_build_object('nonce', n, 'expires_at', expires);
END $$;

-- ===== 매장폰(스캐너) =====
CREATE OR REPLACE FUNCTION public.register_attendance_scanner(p_store_id uuid, p_label text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); token text := encode(gen_random_bytes(32), 'hex'); saved public.attendance_scanners;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  IF NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
  INSERT INTO public.attendance_scanners(store_id, label, token_hash, created_by)
  VALUES (p_store_id, btrim(coalesce(p_label, '')), digest(token, 'sha256'), caller)
  RETURNING * INTO saved;
  RETURN jsonb_build_object('scanner_id', saved.id, 'token', token);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_attendance_scanner(p_scanner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); s public.attendance_scanners;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  SELECT * INTO s FROM public.attendance_scanners WHERE id = p_scanner_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_admin(s.store_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
  IF s.revoked_at IS NULL THEN
    UPDATE public.attendance_scanners SET revoked_at = now(), revoked_by = caller WHERE id = s.id;
  END IF;
END $$;

-- 스캐너가 매장 이름 확인용으로 호출 (토큰 유효성 점검)
CREATE OR REPLACE FUNCTION public.attendance_scanner_status(p_scanner_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE s public.attendance_scanners; store_name text;
BEGIN
  SELECT * INTO s FROM public.attendance_scanners WHERE token_hash = digest(coalesce(p_scanner_token, ''), 'sha256');
  IF NOT FOUND OR s.revoked_at IS NOT NULL OR NOT public.is_store_active(s.store_id) THEN RAISE EXCEPTION 'ATTENDANCE_SCANNER_INVALID'; END IF;
  SELECT name INTO store_name FROM public.stores WHERE id = s.store_id;
  RETURN jsonb_build_object('scanner_id', s.id, 'store_name', store_name, 'label', s.label);
END $$;

-- 스캔: 매장폰 토큰 + 직원 QR → 기록 (anon 호출 허용, 함수 안에서 모든 검증)
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

  -- 같은 QR 재제출(응답 유실 재시도): 기존 기록 반환
  SELECT * INTO existing FROM public.attendance_punches WHERE qr_nonce = n;
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
    UPDATE private.attendance_qr_nonces SET used_at = at_time WHERE nonce = n;
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
  UPDATE private.attendance_qr_nonces SET used_at = at_time WHERE nonce = n;
  IF s.last_seen_at IS NULL OR s.last_seen_at < at_time - interval '1 minute' THEN
    UPDATE public.attendance_scanners SET last_seen_at = at_time WHERE id = s.id;
  END IF;
  RETURN jsonb_build_object('punch_id', saved.id, 'kind', saved.kind, 'punched_at', saved.punched_at,
    'flags', to_jsonb(saved.flags), 'duplicate', false,
    'employee_name', left(emp.name, 1) || repeat('*', greatest(char_length(emp.name) - 1, 0)));
END $$;

-- ===== 관리자 직접 기록 (폰 없는 직원 등) =====
CREATE OR REPLACE FUNCTION public.record_manual_attendance(p_store_id uuid, p_employee_id uuid, p_kind text, p_at timestamptz, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); emp public.employees; saved public.attendance_punches;
BEGIN
  IF caller IS NULL OR NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
  IF p_kind NOT IN ('clock_in', 'clock_out') OR p_at IS NULL OR p_at > now() + interval '5 minutes' THEN RAISE EXCEPTION 'ATTENDANCE_INPUT_INVALID'; END IF;
  IF length(btrim(coalesce(p_reason, ''))) = 0 THEN RAISE EXCEPTION 'ATTENDANCE_REASON_REQUIRED'; END IF;
  SELECT * INTO emp FROM public.employees WHERE id = p_employee_id AND store_id = p_store_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'ATTENDANCE_NOT_EMPLOYEE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('attendance_punch:' || emp.id::text, 0));
  saved := public.attendance_insert_punch(emp, p_at, 'manual', p_kind, NULL, NULL, NULL, p_reason, caller);
  RETURN saved.id;
END $$;

-- ===== 정정 요청·처리 =====
CREATE OR REPLACE FUNCTION public.request_attendance_correction(
  p_store_id uuid, p_employee_id uuid, p_action text, p_target_punch_id uuid, p_kind text, p_time timestamptz, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE caller uuid := auth.uid(); emp public.employees; target public.attendance_punches; saved uuid;
BEGIN
  IF caller IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_AUTH_REQUIRED'; END IF;
  SELECT * INTO emp FROM public.employees WHERE id = p_employee_id AND store_id = p_store_id AND is_active;
  IF NOT FOUND OR NOT public.is_store_active(p_store_id) THEN RAISE EXCEPTION 'ATTENDANCE_NOT_EMPLOYEE'; END IF;
  IF emp.user_id IS DISTINCT FROM caller AND NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION 'ATTENDANCE_ADMIN_REQUIRED'; END IF;
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
  note := '정정 승인: ' || req.reason;
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

CREATE OR REPLACE FUNCTION public.cancel_attendance_correction(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
DECLARE req public.attendance_correction_requests;
BEGIN
  SELECT * INTO req FROM public.attendance_correction_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR req.status <> 'pending' OR req.requested_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'ATTENDANCE_CORRECTION_NOT_PENDING'; END IF;
  UPDATE public.attendance_correction_requests SET status = 'cancelled' WHERE id = req.id;
END $$;

-- 퇴사 처리 시 다른 매장 근무가 없으면 기기 자동 해제
CREATE OR REPLACE FUNCTION public.revoke_attendance_devices_on_resign() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = extensions, public, pg_temp AS $$
BEGIN
  IF OLD.is_active AND NOT NEW.is_active AND NEW.user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.user_id = NEW.user_id AND e.is_active AND e.id <> NEW.id) THEN
    UPDATE public.attendance_devices SET status = 'revoked', revoked_at = now(), revoked_reason = '퇴사 처리로 자동 해제'
    WHERE user_id = NEW.user_id AND status IN ('pending', 'active');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER revoke_attendance_devices_on_resign AFTER UPDATE OF is_active ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.revoke_attendance_devices_on_resign();

REVOKE ALL ON public.attendance_devices, public.attendance_scanners, public.attendance_punches,
  public.attendance_correction_requests, public.attendance_effective_punches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.attendance_devices, public.attendance_punches, public.attendance_correction_requests,
  public.attendance_effective_punches TO authenticated;
GRANT SELECT (id, store_id, label, created_by, created_at, last_seen_at, revoked_at, revoked_by)
  ON public.attendance_scanners TO authenticated;

-- 권한: 쓰기는 RPC로만. punch/scanner_status만 anon 허용(스캐너는 로그인하지 않음).
REVOKE ALL ON FUNCTION public.kst_date(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kst_date(timestamptz) TO authenticated;
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.register_attendance_device(text)', 'public.approve_attendance_device(uuid)', 'public.revoke_attendance_device(uuid, text)',
    'public.list_store_attendance_devices(uuid)', 'public.issue_attendance_qr(uuid)', 'public.register_attendance_scanner(uuid, text)',
    'public.revoke_attendance_scanner(uuid)', 'public.record_manual_attendance(uuid, uuid, text, timestamptz, text)',
    'public.request_attendance_correction(uuid, uuid, text, uuid, text, timestamptz, text)',
    'public.review_attendance_correction(uuid, boolean, text)', 'public.cancel_attendance_correction(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.punch_attendance(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.punch_attendance(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.attendance_scanner_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attendance_scanner_status(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_attendance_punch_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_attendance_devices_on_resign() FROM PUBLIC, anon, authenticated;

COMMIT;
