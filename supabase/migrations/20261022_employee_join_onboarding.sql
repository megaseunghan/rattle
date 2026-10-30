BEGIN;
CREATE TABLE public.store_join_profiles (
  member_id uuid PRIMARY KEY REFERENCES public.store_members(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  applicant_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  employment_type text NOT NULL CHECK(employment_type IN ('regular','part_time')),
  hourly_wage numeric,
  weekly_hours integer,
  base_salary numeric NOT NULL,
  non_taxable numeric NOT NULL,
  joined_at date NOT NULL,
  bank_name text NOT NULL CHECK(length(trim(bank_name)) BETWEEN 1 AND 50),
  account_number text NOT NULL CHECK(account_number ~ '^[0-9]{6,30}$'),
  revision integer NOT NULL DEFAULT 1,
  reviewed_revision integer,
  reviewed_profile jsonb,
  created_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(joined_at BETWEEN DATE '1900-01-01' AND DATE '2100-12-31'),
  CHECK((employment_type='part_time' AND hourly_wage IS NOT NULL AND weekly_hours IS NOT NULL AND hourly_wage BETWEEN 1 AND 10000000 AND hourly_wage=trunc(hourly_wage)
    AND weekly_hours BETWEEN 0 AND 168 AND base_salary=0 AND non_taxable=0) OR
    (employment_type='regular' AND hourly_wage IS NULL AND weekly_hours IS NULL
    AND base_salary BETWEEN 1 AND 1000000000 AND base_salary=trunc(base_salary)
    AND non_taxable BETWEEN 0 AND base_salary AND non_taxable=trunc(non_taxable)))
);
ALTER TABLE public.store_join_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY join_profile_read ON public.store_join_profiles FOR SELECT TO authenticated
  USING(applicant_user_id=auth.uid() OR public.is_store_admin(store_id));
REVOKE ALL ON public.store_join_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.store_join_profiles TO authenticated;

-- 직원 제출과 관리자 수정 모두 같은 서버 검증을 통과한다.
CREATE FUNCTION public.validate_join_profile(p_profile jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE p public.store_join_profiles%ROWTYPE; hours numeric;
BEGIN
  IF p_profile IS NULL OR jsonb_typeof(p_profile)<>'object' THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
  p.employment_type:=p_profile->>'employment_type';
  p.hourly_wage:=(p_profile->>'hourly_wage')::numeric;
  hours:=(p_profile->>'weekly_hours')::numeric;
  IF hours IS NOT NULL AND (hours<>trunc(hours) OR hours NOT BETWEEN 0 AND 168) THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
  p.weekly_hours:=hours::integer;
  p.base_salary:=(p_profile->>'base_salary')::numeric;
  p.non_taxable:=(p_profile->>'non_taxable')::numeric;
  IF (p_profile->>'joined_at') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
  p.joined_at:=(p_profile->>'joined_at')::date;
  p.bank_name:=trim(p_profile->>'bank_name');
  p.account_number:=regexp_replace(p_profile->>'account_number','[- ]','','g');
  IF NOT coalesce((p.employment_type='part_time' AND p.hourly_wage BETWEEN 1 AND 10000000 AND p.hourly_wage=trunc(p.hourly_wage)
      AND p.weekly_hours BETWEEN 0 AND 168 AND p.base_salary=0 AND p.non_taxable=0) OR
    (p.employment_type='regular' AND p.hourly_wage IS NULL AND p.weekly_hours IS NULL AND p.base_salary BETWEEN 1 AND 1000000000
      AND p.base_salary=trunc(p.base_salary) AND p.non_taxable BETWEEN 0 AND p.base_salary AND p.non_taxable=trunc(p.non_taxable)),false)
    OR NOT coalesce(p.joined_at BETWEEN DATE '1900-01-01' AND DATE '2100-12-31',false)
    OR NOT coalesce(length(p.bank_name) BETWEEN 1 AND 50,false) OR NOT coalesce(p.account_number ~ '^[0-9]{6,30}$',false)
  THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
  RETURN jsonb_build_object('employment_type',p.employment_type,'hourly_wage',p.hourly_wage,'weekly_hours',p.weekly_hours,
    'base_salary',p.base_salary,'non_taxable',p.non_taxable,'joined_at',p.joined_at,'bank_name',p.bank_name,'account_number',p.account_number);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID';
END;
$$;
REVOKE ALL ON FUNCTION public.validate_join_profile(jsonb) FROM PUBLIC,anon,authenticated;

-- 신규 신청과 온보딩 저장을 한 트랜잭션에서 처리한다. 기존 대기 신청은 정보 보완 가능.
CREATE FUNCTION public.submit_join_onboarding(p_business_number text,p_name text,p_phone text,p_profile jsonb)
RETURNS TABLE(store_id uuid,store_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; sname text; mid uuid; m public.store_members%ROWTYPE; profile public.store_join_profiles%ROWTYPE;
  business text := regexp_replace(coalesce(p_business_number,''),'[^0-9]','','g');
  phone_text text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF length(business)<>10 OR length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 100
    OR phone_text !~ '^01[016789][0-9]{7,8}$' THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
  SELECT s.id,s.name INTO sid,sname FROM public.stores s
    WHERE regexp_replace(coalesce(s.business_number,''),'[^0-9]','','g')=business;
  IF NOT FOUND THEN RAISE EXCEPTION '해당 사업자번호의 매장을 찾을 수 없습니다'; END IF;
  IF (SELECT count(*) FROM public.stores s WHERE regexp_replace(coalesce(s.business_number,''),'[^0-9]','','g')=business)<>1 THEN
    RAISE EXCEPTION '같은 사업자번호의 매장이 여러 곳입니다. 관리자에게 매장 정보를 확인해주세요'; END IF;
  -- 기존 승인 함수와 동일한 잠금 순서: 기존 신청 → 매장.
  SELECT * INTO m FROM public.store_members sm WHERE sm.store_id=sid AND sm.user_id=auth.uid() FOR UPDATE;
  PERFORM 1 FROM public.stores s WHERE s.id=sid FOR UPDATE;
  -- 최초 동시 신청도 매장 잠금 후 다시 확인한다.
  IF m.id IS NULL THEN SELECT * INTO m FROM public.store_members sm WHERE sm.store_id=sid AND sm.user_id=auth.uid() FOR UPDATE; END IF;
  IF m.status='approved' THEN RAISE EXCEPTION '이미 해당 매장에 참여하고 있어요'; END IF;
  IF m.status='rejected' THEN RAISE EXCEPTION '참여가 거절된 상태입니다. 관리자에게 문의해주세요'; END IF;
  profile := jsonb_populate_record(NULL::public.store_join_profiles,public.validate_join_profile(p_profile));
  IF m.id IS NULL THEN
    INSERT INTO public.store_members(store_id,user_id,user_email,applicant_name,phone,role,status)
      SELECT sid,auth.uid(),u.email,trim(p_name),phone_text,'member','pending' FROM auth.users u WHERE u.id=auth.uid() RETURNING id INTO mid;
  ELSE
    mid:=m.id;
    UPDATE public.store_members SET applicant_name=trim(p_name),phone=phone_text WHERE id=mid;
  END IF;
  BEGIN
    INSERT INTO public.store_join_profiles(member_id,store_id,applicant_user_id,submitted_by,employment_type,hourly_wage,weekly_hours,base_salary,non_taxable,joined_at,bank_name,account_number)
    VALUES(mid,sid,auth.uid(),auth.uid(),profile.employment_type,profile.hourly_wage,profile.weekly_hours,profile.base_salary,profile.non_taxable,profile.joined_at,profile.bank_name,profile.account_number)
    ON CONFLICT(member_id) DO UPDATE SET employment_type=excluded.employment_type,hourly_wage=excluded.hourly_wage,
      weekly_hours=excluded.weekly_hours,base_salary=excluded.base_salary,non_taxable=excluded.non_taxable,
      joined_at=excluded.joined_at,bank_name=excluded.bank_name,account_number=excluded.account_number,
      submitted_by=auth.uid(),revision=store_join_profiles.revision+1,reviewed_revision=NULL,reviewed_profile=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=now();
  EXCEPTION WHEN check_violation OR not_null_violation OR numeric_value_out_of_range THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END;
  RETURN QUERY SELECT sid,sname;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_join_onboarding(text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_join_onboarding(text,text,text,jsonb) TO authenticated;

-- 신규 직원 생성 경로만 초기 조건과 급여 이력을 반영한다. 기존 직원은 덮어쓰지 않는다.
CREATE FUNCTION public.create_employee_from_join(p_store_id uuid,p_user_id uuid,p_name text,p_phone text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE profile public.store_join_profiles%ROWTYPE; eid uuid;
BEGIN
  IF NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION '승인할 권한이 없습니다'; END IF;
  SELECT jp.* INTO profile FROM public.store_join_profiles jp JOIN public.store_members m ON m.id=jp.member_id
    WHERE m.store_id=p_store_id AND m.user_id=p_user_id;
  IF profile.member_id IS NULL THEN
    INSERT INTO public.employees(store_id,user_id,name,phone,joined_at) VALUES(p_store_id,p_user_id,p_name,p_phone,CURRENT_DATE) RETURNING id INTO eid;
  ELSE
    IF profile.reviewed_revision IS DISTINCT FROM profile.revision OR profile.reviewed_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'JOIN_REVIEW_REQUIRED'; END IF;
    profile := jsonb_populate_record(profile,profile.reviewed_profile);
    INSERT INTO public.employees(store_id,user_id,name,phone,joined_at,employment_type,hourly_wage,weekly_hours,base_salary,non_taxable,bank_name,account_number)
      VALUES(p_store_id,p_user_id,p_name,p_phone,profile.joined_at,profile.employment_type,profile.hourly_wage,profile.weekly_hours,
        profile.base_salary,profile.non_taxable,profile.bank_name,profile.account_number) RETURNING id INTO eid;
    INSERT INTO public.employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable,memo,created_by)
      VALUES(p_store_id,eid,profile.joined_at,profile.base_salary,profile.hourly_wage,profile.non_taxable,'참여 신청 정보 확인',auth.uid());
  END IF;
  UPDATE public.store_join_profiles SET created_employee_id=eid WHERE member_id=profile.member_id;
  RETURN eid;
END;
$$;
REVOKE ALL ON FUNCTION public.create_employee_from_join(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.guard_join_profile_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status='approved' AND OLD.status IS DISTINCT FROM 'approved' AND EXISTS (
    SELECT 1 FROM public.store_join_profiles p WHERE p.member_id=NEW.id AND
      (p.reviewed_revision IS DISTINCT FROM p.revision OR p.reviewed_by IS DISTINCT FROM auth.uid())
  ) THEN RAISE EXCEPTION 'JOIN_REVIEW_REQUIRED'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_join_profile_review() FROM PUBLIC;
CREATE TRIGGER guard_join_profile_review BEFORE UPDATE OF status ON public.store_members FOR EACH ROW EXECUTE FUNCTION public.guard_join_profile_review();

CREATE FUNCTION public.approve_join_onboarding(p_member_id uuid,p_revision integer,p_review jsonb,p_choice text DEFAULT 'auto',p_employee_id uuid DEFAULT NULL)
RETURNS TABLE(employee_id uuid,employee_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m public.store_members%ROWTYPE; p public.store_join_profiles%ROWTYPE; result record; reviewed jsonb; today_kst date:=(now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  SELECT * INTO m FROM public.store_members WHERE id=p_member_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_admin(m.store_id) THEN RAISE EXCEPTION '승인할 권한이 없습니다'; END IF;
  IF m.status<>'pending' THEN RAISE EXCEPTION '이미 처리된 신청입니다. 목록을 다시 확인해주세요'; END IF;
  reviewed:=public.validate_join_profile(p_review);
  SELECT * INTO p FROM public.store_join_profiles WHERE member_id=m.id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_revision IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'JOIN_REVIEW_CHANGED'; END IF;
    p:=jsonb_populate_record(NULL::public.store_join_profiles,reviewed);
    INSERT INTO public.store_join_profiles(member_id,store_id,applicant_user_id,submitted_by,employment_type,hourly_wage,weekly_hours,base_salary,non_taxable,joined_at,bank_name,account_number)
      VALUES(m.id,m.store_id,m.user_id,auth.uid(),p.employment_type,p.hourly_wage,p.weekly_hours,p.base_salary,p.non_taxable,p.joined_at,p.bank_name,p.account_number);
  ELSIF p.revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'JOIN_REVIEW_CHANGED'; END IF;
  UPDATE public.store_join_profiles SET reviewed_revision=revision,reviewed_profile=reviewed,reviewed_by=auth.uid(),reviewed_at=now() WHERE member_id=m.id;
  IF p_choice='auto' AND p_employee_id IS NULL THEN SELECT * INTO result FROM public.approve_store_member(m.id);
  ELSIF p_choice='new' AND p_employee_id IS NULL THEN SELECT * INTO result FROM public.resolve_store_member_approval(m.id,NULL);
  ELSIF p_choice='rehire' AND p_employee_id IS NOT NULL THEN SELECT * INTO result FROM public.resolve_store_member_approval(m.id,p_employee_id);
  ELSE RAISE EXCEPTION 'JOIN_REVIEW_CHANGED'; END IF;
  SELECT * INTO p FROM public.store_join_profiles WHERE member_id=m.id;
  IF p.created_employee_id IS DISTINCT FROM result.employee_id THEN
    p:=jsonb_populate_record(p,reviewed);
    -- 기존·재입사 직원의 과거 급여 행은 보존. 확정 조건은 오늘부터 새 이력으로 추가한다.
    UPDATE public.employees SET employment_type=p.employment_type,hourly_wage=p.hourly_wage,weekly_hours=p.weekly_hours,
      base_salary=p.base_salary,non_taxable=p.non_taxable,joined_at=p.joined_at,bank_name=p.bank_name,account_number=p.account_number
      WHERE id=result.employee_id AND store_id=m.store_id;
    INSERT INTO public.employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable,memo,created_by)
      VALUES(m.store_id,result.employee_id,today_kst,p.base_salary,p.hourly_wage,p.non_taxable,'최종 합류 조건 확인',auth.uid());
  END IF;
  RETURN QUERY SELECT result.employee_id::uuid,result.employee_name::text;
END;
$$;
REVOKE ALL ON FUNCTION public.approve_join_onboarding(uuid,integer,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_join_onboarding(uuid,integer,jsonb,text,uuid) TO authenticated;

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
    PERFORM public.create_employee_from_join(NEW.store_id,NEW.user_id,name_text,phone_text);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_store_member_approval(p_member_id uuid, p_employee_id uuid DEFAULT NULL)
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
    chosen_id := public.create_employee_from_join(m.store_id,m.user_id,name_text,phone_text);
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

COMMIT;
