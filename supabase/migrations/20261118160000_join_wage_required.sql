-- 최종 합류 급여 조건 필수 / 사용자 결정 2026-11-18.
-- 선행: 20261118150000_daily_work_labor_read_models.sql 및 기존 합류/급여 이력/역할 체인.
-- 신규 직원은 고용형태별 양수 급여, 재활성화는 현재 유효 이력 필수.
-- 관리자 입력을 최종 합류 RPC가 같은 트랜잭션에서 이력으로 저장하면 허용.
-- 기존 직원/명세/이력을 일괄 수정하지 않는다. QR 실패 합계 NULL 안전장치는 유지.
-- 원격 미적용. 실패 시 전체 ROLLBACK. 적용 후 복구는 새 보정 파일에서 이 파일의
-- 두 constraint trigger/private 함수와 새 후보 RPC를 제거/보정하고 approve_join_onboarding을
-- 이전 정의로 복원한다. 원본/급여 이력은 삭제하지 않는다.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;

CREATE FUNCTION private.assert_join_wage(p_employee_id uuid,p_mode text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE e public.employees; h public.employee_wage_history; rate numeric; monthly numeric;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=p_employee_id FOR SHARE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'JOIN_EMPLOYEE_REQUIRED'; END IF;
 IF auth.uid() IS NULL OR NOT coalesce(public.is_store_admin(e.store_id),false) THEN
  RAISE EXCEPTION 'EMPLOYEE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF e.employment_type IS NULL OR e.employment_type NOT IN ('part_time','regular') THEN
  RAISE EXCEPTION 'JOIN_EMPLOYMENT_TYPE_REQUIRED'; END IF;
 rate:=e.hourly_wage; monthly:=e.base_salary;
 IF p_mode<>'new' THEN
  -- Latest effective condition is authoritative; never revive an older valid rate
  -- underneath a newer invalid one or use a future condition early.
  SELECT * INTO h FROM public.employee_wage_history
   WHERE employee_id=e.id AND store_id=e.store_id
    AND effective_date<=(now() AT TIME ZONE 'Asia/Seoul')::date
   ORDER BY effective_date DESC,created_at DESC,id DESC LIMIT 1 FOR SHARE;
  IF h.id IS NULL AND p_mode='rehire' THEN RAISE EXCEPTION 'JOIN_WAGE_HISTORY_REQUIRED'; END IF;
  IF h.id IS NOT NULL THEN rate:=h.hourly_wage; monthly:=h.base_salary; END IF;
 END IF;
 IF e.employment_type='part_time' AND
  (rate IS NULL OR rate<=0 OR rate::text IN ('NaN','Infinity','-Infinity')) THEN
  RAISE EXCEPTION 'JOIN_HOURLY_WAGE_REQUIRED'; END IF;
 IF e.employment_type='regular' AND
  (monthly IS NULL OR monthly<=0 OR monthly::text IN ('NaN','Infinity','-Infinity')) THEN
  RAISE EXCEPTION 'JOIN_BASE_SALARY_REQUIRED'; END IF;
END $$;

CREATE FUNCTION private.guard_employee_join_wage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 -- Deferred evaluation sees the final row and same-transaction wage history.
 -- Normal edits/deactivation of existing incomplete staff remain possible.
 IF TG_OP='UPDATE' THEN
  IF OLD.is_active IS TRUE OR NEW.is_active IS NOT TRUE THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=NEW.id AND is_active IS TRUE) THEN RETURN NULL; END IF;
  PERFORM private.assert_join_wage(NEW.id,'rehire');
 ELSIF EXISTS(SELECT 1 FROM public.employees WHERE id=NEW.id) THEN
  PERFORM private.assert_join_wage(NEW.id,'new');
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER employee_join_wage_required
 AFTER INSERT OR UPDATE ON public.employees DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION private.guard_employee_join_wage();

CREATE FUNCTION private.guard_member_join_wage() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE eid uuid; m public.store_members;
BEGIN
 IF NEW.status IS DISTINCT FROM 'approved' OR OLD.status='approved' THEN RETURN NULL; END IF;
 -- Do not approve an unlinked account through a legacy RPC or direct status update.
 SELECT * INTO m FROM public.store_members WHERE id=NEW.id FOR SHARE;
 IF m.id IS NULL OR m.status IS DISTINCT FROM 'approved' THEN RETURN NULL; END IF;
 SELECT id INTO eid FROM public.employees WHERE store_id=m.store_id AND user_id=m.user_id AND is_active IS TRUE;
 IF eid IS NULL THEN RAISE EXCEPTION 'JOIN_EMPLOYEE_REQUIRED'; END IF;
 PERFORM private.assert_join_wage(eid,'member');
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER member_join_wage_required
 AFTER UPDATE ON public.store_members DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION private.guard_member_join_wage();
REVOKE ALL ON FUNCTION private.assert_join_wage(uuid,text),private.guard_employee_join_wage(),private.guard_member_join_wage()
 FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION private.assert_join_wage(uuid,text) IS 'Commit-time hire/rehire boundary; no backfill or payroll writes; positive finite wage required';
-- Additive candidate RPC: preserve the original return type and caller compatibility.
CREATE FUNCTION public.get_member_approval_wage_candidates(p_member_id uuid)
RETURNS TABLE(id uuid,name text,phone text,is_active boolean,joined_at date,created_at timestamptz,
 has_other_account boolean,is_applicant_account boolean,employment_type text,wage_condition_valid boolean,
 wage_history_id uuid,wage_effective_date date,wage_hourly_wage numeric,wage_base_salary numeric,existing_wage jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 RETURN QUERY SELECT c.id,c.name,c.phone,c.is_active,c.joined_at,c.created_at,c.has_other_account,c.is_applicant_account,
  e.employment_type,coalesce(e.is_active IS NOT TRUE AND NOT c.has_other_account AND h.id IS NOT NULL AND (
   (e.employment_type='part_time' AND h.hourly_wage>0 AND h.hourly_wage::text NOT IN ('NaN','Infinity','-Infinity')) OR
   (e.employment_type='regular' AND h.base_salary>0 AND h.base_salary::text NOT IN ('NaN','Infinity','-Infinity'))),false),
  h.id,h.effective_date,h.hourly_wage,h.base_salary,
  CASE WHEN h.id IS NOT NULL AND (
   (e.employment_type='part_time' AND h.hourly_wage>0 AND h.hourly_wage::text NOT IN ('NaN','Infinity','-Infinity')) OR
   (e.employment_type='regular' AND h.base_salary>0 AND h.base_salary::text NOT IN ('NaN','Infinity','-Infinity')))
  THEN jsonb_build_object('employment_type',e.employment_type,'hourly_wage',h.hourly_wage,
    'base_salary',h.base_salary,'effective_date',h.effective_date) ELSE NULL END
 FROM public.get_member_approval_candidates(p_member_id) c
 JOIN public.employees e ON e.id=c.id
 LEFT JOIN LATERAL (
  SELECT w.* FROM public.employee_wage_history w WHERE w.employee_id=e.id AND w.store_id=e.store_id
   AND w.effective_date<=(now() AT TIME ZONE 'Asia/Seoul')::date
  ORDER BY w.effective_date DESC,w.created_at DESC,w.id DESC LIMIT 1
 ) h ON true;
END $$;
REVOKE ALL ON FUNCTION public.get_member_approval_wage_candidates(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_approval_wage_candidates(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_join_onboarding(p_member_id uuid,p_revision integer,p_review jsonb,p_choice text DEFAULT 'auto',p_employee_id uuid DEFAULT NULL)
RETURNS TABLE(employee_id uuid,employee_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
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
$$;
REVOKE ALL ON FUNCTION public.approve_join_onboarding(uuid,integer,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_join_onboarding(uuid,integer,jsonb,text,uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
