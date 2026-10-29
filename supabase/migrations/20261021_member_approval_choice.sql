BEGIN;

-- 관리자에게만 해당 신청과 겹치는 직원 정보를 제공한다.
CREATE FUNCTION public.get_member_approval_candidates(p_member_id uuid)
RETURNS TABLE(id uuid, name text, phone text, is_active boolean, joined_at date,
  created_at timestamptz, has_other_account boolean, is_applicant_account boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.store_members%ROWTYPE;
BEGIN
  SELECT * INTO m FROM public.store_members WHERE store_members.id = p_member_id;
  IF NOT FOUND OR NOT public.is_store_admin(m.store_id) THEN RAISE EXCEPTION '승인할 권한이 없습니다'; END IF;
  IF m.status <> 'pending' THEN RAISE EXCEPTION '이미 처리된 신청입니다. 목록을 다시 확인해주세요'; END IF;
  RETURN QUERY SELECT e.id, e.name, e.phone, e.is_active, e.joined_at, e.created_at,
    (e.user_id IS NOT NULL AND e.user_id <> m.user_id), coalesce(e.user_id = m.user_id, false)
  FROM public.employees e WHERE e.store_id = m.store_id AND (
    trim(e.name) = trim(coalesce(m.applicant_name, '')) OR
    regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g') OR
    e.user_id = m.user_id
  ) ORDER BY e.is_active DESC, e.created_at, e.id;
END;
$$;
REVOKE ALL ON FUNCTION public.get_member_approval_candidates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_approval_candidates(uuid) TO authenticated;

-- 기존 자동 연결은 유지한다. 퇴사 기록 충돌에 대해서만 관리자가 선택해 승인한다.
-- p_employee_id NULL = 다른 사람으로 신규 등록, UUID = 선택한 퇴사 직원 재입사.
CREATE FUNCTION public.resolve_store_member_approval(p_member_id uuid, p_employee_id uuid DEFAULT NULL)
RETURNS TABLE(employee_id uuid, employee_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m public.store_members%ROWTYPE;
  selected public.employees%ROWTYPE;
  chosen_id uuid;
  name_text text;
  phone_text text;
BEGIN
  SELECT * INTO m FROM public.store_members WHERE id = p_member_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_admin(m.store_id) THEN RAISE EXCEPTION '승인할 권한이 없습니다'; END IF;
  IF m.status <> 'pending' THEN RAISE EXCEPTION '이미 처리된 신청입니다. 목록을 다시 확인해주세요'; END IF;
  PERFORM 1 FROM public.stores WHERE id = m.store_id FOR UPDATE;
  -- 잠금 후 권한 재검증. 같은 매장의 승인과 기존 연결·급여 정보를 보호한다.
  IF NOT public.is_store_admin(m.store_id) THEN RAISE EXCEPTION '승인할 권한이 없습니다'; END IF;
  name_text := trim(coalesce(m.applicant_name, ''));
  phone_text := regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g');
  IF name_text = '' OR phone_text !~ '^01[016789][0-9]{7,8}$' THEN
    RAISE EXCEPTION '신청자의 이름·휴대폰 번호를 확인해주세요. 기존 신청은 삭제 후 다시 신청할 수 있습니다';
  END IF;
  PERFORM e.id FROM public.employees e WHERE e.store_id = m.store_id AND (
    trim(e.name) = name_text OR regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g') = phone_text OR e.user_id = m.user_id
  ) ORDER BY e.id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.employees e WHERE e.store_id = m.store_id AND e.is_active AND (
    trim(e.name) = name_text OR regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g') = phone_text OR e.user_id = m.user_id
  )) THEN RAISE EXCEPTION 'MEMBER_ACTIVE_CONFLICT'; END IF;
  IF p_employee_id IS NULL THEN
    -- 같은 계정의 과거 기록을 숨기고 새 직원을 만드는 우회를 막는다.
    IF EXISTS (SELECT 1 FROM public.employees e WHERE e.store_id = m.store_id AND e.user_id = m.user_id) THEN
      RAISE EXCEPTION 'MEMBER_EXISTING_ACCOUNT';
    END IF;
    INSERT INTO public.employees(store_id, user_id, name, phone, joined_at)
      VALUES(m.store_id, m.user_id, name_text, phone_text, CURRENT_DATE) RETURNING id INTO chosen_id;
  ELSE
    SELECT * INTO selected FROM public.employees e WHERE e.id = p_employee_id AND e.store_id = m.store_id FOR UPDATE;
    IF NOT FOUND OR selected.is_active OR NOT (
      trim(selected.name) = name_text OR regexp_replace(coalesce(selected.phone, ''), '[^0-9]', '', 'g') = phone_text OR
      coalesce(selected.user_id = m.user_id, false)
    ) THEN RAISE EXCEPTION 'MEMBER_CHOICE_CHANGED'; END IF;
    IF selected.user_id IS NOT NULL AND selected.user_id <> m.user_id THEN RAISE EXCEPTION 'MEMBER_OTHER_ACCOUNT'; END IF;
    IF EXISTS (SELECT 1 FROM public.employees e WHERE e.store_id = m.store_id AND e.user_id = m.user_id AND e.id <> selected.id) THEN
      RAISE EXCEPTION 'MEMBER_EXISTING_ACCOUNT';
    END IF;
    -- 직원 ID·급여·입사일 등 과거 조건은 보존한다. 현재 고용 조건은 승인 후 관리자가 검토한다.
    UPDATE public.employees SET user_id = m.user_id, is_active = true WHERE id = selected.id;
    chosen_id := selected.id;
  END IF;
  -- 기존 트리거는 이미 연결된 재직 직원을 확인하므로 추가 직원을 생성하지 않는다.
  UPDATE public.store_members SET status = 'approved' WHERE id = m.id;
  RETURN QUERY SELECT e.id, e.name FROM public.employees e WHERE e.id = chosen_id;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_store_member_approval(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_store_member_approval(uuid, uuid) TO authenticated;
COMMIT;
