-- 원격 적용본 함수 원본(2026-11-28 읽기 전용 조회). 코드만 있고 비밀·ID·자료 없음.
-- 각 정의 위 주석의 md5는 pg_proc.prosrc의 md5이며 scripts/validate-join-store-fill-sql.mjs가 로컬 적재본과 대조한다.
-- 20261127132000 마이그레이션의 md5 가드·조각 교체 검사용. 이 파일을 고치지 않는다.
-- 조회 출력에는 문장 끝 세미콜론이 없어 각 정의 끝(`$function$;`)에만 세미콜론을 더했다. 본문은 그대로다.

-- approve_join_onboarding(uuid,integer,jsonb,text,uuid) md5=9b68e7b80b76e21ed08bf9e66ec9e011
CREATE OR REPLACE FUNCTION public.approve_join_onboarding(p_member_id uuid, p_revision integer, p_review jsonb, p_choice text DEFAULT 'auto'::text, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(employee_id uuid, employee_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
DECLARE m public.store_members%ROWTYPE; p public.store_join_profiles%ROWTYPE; result record; reviewed jsonb; selected public.employees; h public.employee_wage_history; expected_wage_id uuid; today_kst date:=(now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  SELECT * INTO m FROM public.store_members WHERE id=p_member_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_admin(m.store_id) THEN RAISE EXCEPTION '승인할 권한이 없습니다'; END IF;
  IF m.status<>'pending' THEN RAISE EXCEPTION '이미 처리된 신청입니다. 목록을 다시 확인해주세요'; END IF;
  -- Only an explicit preserve request may omit the full review fields.
  IF p_review ? 'preserve_existing_wage' AND p_review->'preserve_existing_wage'<>'false'::jsonb THEN
    IF p_choice IS DISTINCT FROM 'rehire' OR p_employee_id IS NULL
      OR p_review->'preserve_existing_wage' IS DISTINCT FROM 'true'::jsonb
      OR (p_review-'preserve_existing_wage'-'wage_history_id')<>'{}'::jsonb
      THEN RAISE EXCEPTION 'JOIN_WAGE_PRESERVE_INVALID'; END IF;
    BEGIN expected_wage_id:=(p_review->>'wage_history_id')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'JOIN_WAGE_PRESERVE_INVALID'; END;
    IF expected_wage_id IS NULL THEN RAISE EXCEPTION 'JOIN_WAGE_PRESERVE_INVALID'; END IF;
    PERFORM 1 FROM public.stores WHERE id=m.store_id FOR UPDATE;
    IF auth.uid() IS NULL OR NOT coalesce(public.is_store_admin(m.store_id),false) THEN
      RAISE EXCEPTION 'EMPLOYEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
    SELECT * INTO selected FROM public.employees WHERE id=p_employee_id AND store_id=m.store_id FOR UPDATE;
    IF selected.id IS NULL OR selected.is_active IS TRUE OR
      (selected.user_id IS NOT NULL AND selected.user_id<>m.user_id) THEN RAISE EXCEPTION 'MEMBER_CHOICE_CHANGED'; END IF;
    SELECT w.* INTO h FROM public.employee_wage_history w WHERE w.employee_id=selected.id AND w.store_id=m.store_id
      AND w.effective_date<=today_kst ORDER BY w.effective_date DESC,w.created_at DESC,w.id DESC LIMIT 1 FOR SHARE;
    IF h.id IS NULL THEN RAISE EXCEPTION 'JOIN_WAGE_HISTORY_REQUIRED'; END IF;
    IF h.id IS DISTINCT FROM expected_wage_id THEN RAISE EXCEPTION 'JOIN_WAGE_CONDITION_CHANGED'; END IF;
    PERFORM private.assert_join_wage(selected.id,'rehire');
    SELECT * INTO p FROM public.store_join_profiles WHERE member_id=m.id FOR UPDATE;
    IF (p.member_id IS NULL AND p_revision IS DISTINCT FROM 0) OR
      (p.member_id IS NOT NULL AND p.revision IS DISTINCT FROM p_revision) THEN RAISE EXCEPTION 'JOIN_REVIEW_CHANGED'; END IF;
    -- Preserve applicant source fields; audit the explicit administrator decision only.
    IF p.member_id IS NOT NULL THEN
      UPDATE public.store_join_profiles SET reviewed_revision=revision,
        reviewed_profile=jsonb_build_object('preserve_existing_wage',true,'wage_history_id',h.id,
          'employment_type',selected.employment_type,'hourly_wage',h.hourly_wage,
          'base_salary',h.base_salary,'effective_date',h.effective_date),
        reviewed_by=auth.uid(),reviewed_at=now() WHERE member_id=m.id;
    END IF;
    RETURN QUERY SELECT r.employee_id,r.employee_name FROM public.resolve_store_member_approval(m.id,selected.id) r;
    RETURN; -- no employee pay update and no new wage history in preserve mode.
  END IF;
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
$function$;


-- create_employee_from_join(uuid,uuid,text,text) md5=718b6bc6a0b7569dff46da761c410eb4
CREATE OR REPLACE FUNCTION public.create_employee_from_join(p_store_id uuid, p_user_id uuid, p_name text, p_phone text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;


-- create_store_with_setup(text,text,text,uuid) md5=0c7269d8ed0ffaa0bb257f1c64cfd498
CREATE OR REPLACE FUNCTION public.create_store_with_setup(p_name text, p_pos_choice text, p_share_scope text, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE result public.stores;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 80 OR p_request_id IS NULL
 OR p_pos_choice IS NULL OR p_pos_choice NOT IN ('now','later')
 OR p_share_scope IS NULL OR p_share_scope NOT IN ('none','regular_only','all_staff') THEN RAISE EXCEPTION 'INVALID_STORE_SETUP'; END IF;
 -- Same account+request serializes retries, including a lost success response.
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_request_id::text,0));
 SELECT * INTO result FROM public.stores WHERE owner_id=auth.uid() AND setup_request_id=p_request_id;
 IF FOUND THEN RETURN to_jsonb(result); END IF;
 INSERT INTO public.stores(name,owner_id,financial_share_scope,pos_setup_choice,setup_request_id)
 VALUES(btrim(p_name),auth.uid(),p_share_scope,p_pos_choice,p_request_id) RETURNING * INTO result;
 RETURN to_jsonb(result);
END $function$;


-- submit_join_onboarding_code(text,text,text,jsonb) md5=2738692e827c03ed26acd4cfe69ef3e1
CREATE OR REPLACE FUNCTION public.submit_join_onboarding_code(p_code text, p_name text, p_phone text, p_profile jsonb)
 RETURNS TABLE(store_id uuid, store_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE resolved_token uuid; normalized text := upper(regexp_replace(coalesce(p_code,''),'[ -]','','g'));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF normalized !~ '^[0-9A-F]{16}$' THEN RAISE EXCEPTION 'STORE_INVITE_INVALID'; END IF;
  SELECT i.token INTO resolved_token FROM public.store_invites i
    WHERE i.code=normalized AND i.revoked_at IS NULL AND i.expires_at>now();
  IF resolved_token IS NULL THEN RAISE EXCEPTION 'STORE_INVITE_INVALID'; END IF;
  RETURN QUERY SELECT * FROM public.submit_join_onboarding_invite(resolved_token,p_name,p_phone,p_profile);
END;
$function$;


-- validate_join_profile(jsonb) md5=841a3b896586ae6b144bea1705d1961a
CREATE OR REPLACE FUNCTION public.validate_join_profile(p_profile jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
$function$;


-- guard_store_sharing_owner() md5=c5d02916732cf66b55e3117448e225aa
CREATE OR REPLACE FUNCTION public.guard_store_sharing_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
 IF (NEW.financial_share_scope IS DISTINCT FROM OLD.financial_share_scope OR
     NEW.pos_setup_choice IS DISTINCT FROM OLD.pos_setup_choice OR
     NEW.setup_request_id IS DISTINCT FROM OLD.setup_request_id)
 AND auth.uid() IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $function$;


-- private.prepare_employee_probation() md5=bce1fde925568cdc4fde3254b7a886af
CREATE OR REPLACE FUNCTION private.prepare_employee_probation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE v_start date;
BEGIN
  IF NEW.probation_ends_on IS NOT NULL THEN
    v_start := coalesce(NEW.probation_started_at::date, NEW.joined_at);
    IF v_start IS NOT NULL AND (NEW.probation_ends_on < v_start OR NEW.probation_ends_on > private.probation_max_end(v_start)) THEN
      RAISE EXCEPTION 'PROBATION_END_OUT_OF_RANGE' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NEW.is_probation AND NEW.probation_rate IS NULL THEN
    SELECT s.default_probation_rate INTO NEW.probation_rate FROM public.stores s WHERE s.id = NEW.store_id;
    NEW.probation_rate := coalesce(NEW.probation_rate, 0.9);
  END IF;
  RETURN NEW;
END $function$;


-- private.sync_employee_weekly_minutes() md5=96ce0b96359ed09a31ecb3425dc0cbe7
CREATE OR REPLACE FUNCTION private.sync_employee_weekly_minutes()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.weekly_minutes IS NULL AND NEW.weekly_hours IS NOT NULL THEN NEW.weekly_minutes := NEW.weekly_hours * 60; END IF;
  ELSIF NEW.weekly_hours IS DISTINCT FROM OLD.weekly_hours AND NEW.weekly_minutes IS NOT DISTINCT FROM OLD.weekly_minutes THEN
    NEW.weekly_minutes := CASE WHEN NEW.weekly_hours IS NULL THEN NULL ELSE NEW.weekly_hours * 60 END;
  END IF;
  RETURN NEW;
END $function$;


-- submit_join_onboarding_invite(uuid,text,text,jsonb) md5=4f339fdda5e5902192d08f7b3550669e
CREATE OR REPLACE FUNCTION public.submit_join_onboarding_invite(p_token uuid, p_name text, p_phone text, p_profile jsonb)
 RETURNS TABLE(store_id uuid, store_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE sid uuid; sname text; mid uuid; m public.store_members%ROWTYPE; profile public.store_join_profiles%ROWTYPE;
  phone_text text := regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 100
    OR phone_text !~ '^01[016789][0-9]{7,8}$' THEN RAISE EXCEPTION 'JOIN_PROFILE_INVALID'; END IF;
  SELECT s.id,s.name INTO sid,sname FROM public.store_invites i
    JOIN public.stores s ON s.id=i.store_id
    WHERE i.token=p_token AND i.revoked_at IS NULL AND i.expires_at>now();
  IF sid IS NULL THEN RAISE EXCEPTION 'STORE_INVITE_INVALID'; END IF;
  -- 기존 승인 함수와 동일한 잠금 순서: 기존 신청 → 매장.
  SELECT * INTO m FROM public.store_members sm WHERE sm.store_id=sid AND sm.user_id=auth.uid() FOR UPDATE;
  PERFORM 1 FROM public.stores s WHERE s.id=sid FOR UPDATE;
  -- 링크가 확인과 저장 사이에 재발급되었으면 신청을 중단한다.
  IF NOT EXISTS (SELECT 1 FROM public.store_invites i WHERE i.token=p_token AND i.store_id=sid
    AND i.revoked_at IS NULL AND i.expires_at>now()) THEN RAISE EXCEPTION 'STORE_INVITE_INVALID'; END IF;
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
$function$;


