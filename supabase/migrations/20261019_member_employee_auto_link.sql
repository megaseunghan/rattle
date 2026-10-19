BEGIN;
-- 사업자번호로 참여 신청 → 관리자 승인 시 기존 직원에 연결.
-- 사업자번호와 자기 기입 연락처는 본인 인증 수단이 아니므로 승인을 생략하지 않는다.
CREATE OR REPLACE FUNCTION public.request_store_membership(p_business_number text, p_name text, p_phone text)
RETURNS TABLE(store_id uuid, store_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  number_text text := regexp_replace(coalesce(p_business_number, ''), '[^0-9]', '', 'g');
  phone_text text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  target_id uuid;
  target_name text;
  target_count integer;
  old_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF length(number_text) <> 10 THEN RAISE EXCEPTION '사업자번호 10자리를 입력해주세요'; END IF;
  IF length(trim(coalesce(p_name, ''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION '이름을 100자 이내로 입력해주세요'; END IF;
  IF phone_text !~ '^01[016789][0-9]{7,8}$' THEN RAISE EXCEPTION '휴대폰 번호를 확인해주세요'; END IF;
  SELECT count(*) INTO target_count FROM stores s
    WHERE regexp_replace(coalesce(s.business_number, ''), '[^0-9]', '', 'g') = number_text;
  IF target_count = 0 THEN RAISE EXCEPTION '해당 사업자번호의 매장을 찾을 수 없습니다'; END IF;
  IF target_count <> 1 THEN RAISE EXCEPTION '같은 사업자번호의 매장이 여러 곳입니다. 관리자에게 매장 정보를 확인해주세요'; END IF;
  SELECT s.id, s.name INTO target_id, target_name FROM stores s
    WHERE regexp_replace(coalesce(s.business_number, ''), '[^0-9]', '', 'g') = number_text FOR UPDATE;
  SELECT m.status INTO old_status FROM store_members m WHERE m.store_id = target_id AND m.user_id = auth.uid();
  IF old_status = 'pending' THEN RAISE EXCEPTION '이미 신청했어요. 관리자의 승인을 기다려주세요'; END IF;
  IF old_status = 'approved' THEN RAISE EXCEPTION '이미 해당 매장에 참여하고 있어요'; END IF;
  IF old_status = 'rejected' THEN RAISE EXCEPTION '참여가 거절된 상태입니다. 관리자에게 문의해주세요'; END IF;
  INSERT INTO store_members(store_id, user_id, user_email, applicant_name, phone, role, status)
    SELECT target_id, auth.uid(), u.email, trim(p_name), phone_text, 'member', 'pending' FROM auth.users u WHERE u.id = auth.uid();
  RETURN QUERY SELECT target_id, target_name;
END;
$$;
REVOKE ALL ON FUNCTION public.request_store_membership(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_store_membership(text, text, text) TO authenticated;

-- 예전 클라이언트가 직접 신청해도 관리자 역할로 신청할 수 없다.
DROP POLICY IF EXISTS store_members_insert ON store_members;
CREATE POLICY store_members_insert ON store_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending' AND role = 'member');

CREATE OR REPLACE FUNCTION public.guard_store_member_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION '참여 신청의 매장과 계정은 변경할 수 없습니다';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_store_member_identity ON store_members;
CREATE TRIGGER guard_store_member_identity BEFORE UPDATE ON store_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_store_member_identity();

CREATE OR REPLACE FUNCTION public.create_employee_on_member_approve()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_employee uuid;
  matches integer;
  name_text text := trim(coalesce(NEW.applicant_name, ''));
  phone_text text := regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF NEW.status <> 'approved' OR OLD.status = 'approved' THEN RETURN NEW; END IF;
  IF NOT public.is_store_admin(NEW.store_id) THEN RAISE EXCEPTION '관리자만 참여를 승인할 수 있습니다'; END IF;
  PERFORM 1 FROM stores WHERE id = NEW.store_id FOR UPDATE;
  SELECT e.id INTO target_employee FROM employees e
    WHERE e.store_id = NEW.store_id AND e.user_id = NEW.user_id AND e.is_active FOR UPDATE;
  IF target_employee IS NOT NULL THEN RETURN NEW; END IF;
  IF name_text = '' OR phone_text !~ '^01[016789][0-9]{7,8}$' THEN
    RAISE EXCEPTION '신청자의 이름·휴대폰 번호를 확인해주세요. 기존 신청은 삭제 후 다시 신청할 수 있습니다';
  END IF;
  SELECT count(*) INTO matches FROM employees e WHERE e.store_id = NEW.store_id AND e.is_active
    AND trim(e.name) = name_text AND regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g') = phone_text;
  IF matches > 1 THEN RAISE EXCEPTION '이름·연락처가 같은 직원이 여러 명입니다. 인건비에서 중복 정보를 정리한 뒤 다시 승인해주세요'; END IF;
  IF matches = 1 THEN
    SELECT e.id INTO target_employee FROM employees e WHERE e.store_id = NEW.store_id
      AND trim(e.name) = name_text AND regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g') = phone_text
      AND e.user_id IS NULL AND e.is_active FOR UPDATE;
    IF target_employee IS NULL THEN RAISE EXCEPTION '일치하는 직원이 퇴사 상태이거나 다른 계정에 연결되어 있습니다. 직원 정보를 확인해주세요'; END IF;
    UPDATE employees SET user_id = NEW.user_id WHERE id = target_employee;
  ELSE
    -- 연락처 누락·이름 오타로 같은 직원을 중복 생성하지 않는다.
    IF EXISTS (SELECT 1 FROM employees e WHERE e.store_id = NEW.store_id AND
      (trim(e.name) = name_text OR regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g') = phone_text)) THEN
      RAISE EXCEPTION '이름 또는 연락처가 겹치는 직원이 있습니다. 인건비의 직원 정보와 신청 정보를 맞춘 뒤 다시 승인해주세요';
    END IF;
    INSERT INTO employees(store_id, user_id, name, phone, joined_at)
      VALUES(NEW.store_id, NEW.user_id, name_text, phone_text, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_member_approve_employee ON store_members;
CREATE TRIGGER trg_member_approve_employee AFTER UPDATE ON store_members
  FOR EACH ROW EXECUTE FUNCTION public.create_employee_on_member_approve();

CREATE OR REPLACE FUNCTION public.approve_store_member(p_member_id uuid)
RETURNS TABLE(employee_id uuid, employee_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m store_members%ROWTYPE;
BEGIN
  SELECT * INTO m FROM store_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_admin(m.store_id) THEN RAISE EXCEPTION '승인할 권한이 없습니다'; END IF;
  IF m.status <> 'pending' THEN RAISE EXCEPTION '이미 처리된 신청입니다. 목록을 다시 확인해주세요'; END IF;
  UPDATE store_members SET status = 'approved' WHERE id = m.id;
  RETURN QUERY SELECT e.id, e.name FROM employees e WHERE e.store_id = m.store_id AND e.user_id = m.user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_store_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_store_member(uuid) TO authenticated;

COMMIT;
