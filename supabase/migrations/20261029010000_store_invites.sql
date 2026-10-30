-- 직원 초대는 매장 관리자만 발급하며 새 링크 생성 시 이전 링크를 취소한다.
CREATE TABLE public.store_invites (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  revoked_at timestamptz
);
CREATE INDEX store_invites_active_store_idx ON public.store_invites(store_id) WHERE revoked_at IS NULL;
ALTER TABLE public.store_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_invites FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.create_store_invite(p_store_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION '관리자만 초대할 수 있습니다'; END IF;
  PERFORM 1 FROM public.stores WHERE id=p_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '관리자만 초대할 수 있습니다'; END IF;
  UPDATE public.store_invites SET revoked_at=now() WHERE store_id=p_store_id AND revoked_at IS NULL;
  INSERT INTO public.store_invites(store_id,created_by) VALUES(p_store_id,auth.uid()) RETURNING token INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_store_invite(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_store_invite(uuid) TO authenticated;

CREATE FUNCTION public.get_store_invite(p_token uuid) RETURNS TABLE(store_id uuid,store_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  RETURN QUERY SELECT s.id,s.name FROM public.store_invites i JOIN public.stores s ON s.id=i.store_id
    WHERE i.token=p_token AND i.revoked_at IS NULL AND i.expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'STORE_INVITE_INVALID'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.get_store_invite(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_store_invite(uuid) TO authenticated;

CREATE FUNCTION public.submit_join_onboarding_invite(p_token uuid,p_name text,p_phone text,p_profile jsonb)
RETURNS TABLE(store_id uuid,store_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
$$;
REVOKE ALL ON FUNCTION public.submit_join_onboarding_invite(uuid,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_join_onboarding_invite(uuid,text,text,jsonb) TO authenticated;
