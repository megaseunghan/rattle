-- 기존 초대 링크 스키마를 보존하면서 짧은 참여코드를 추가한다.
ALTER TABLE public.store_invites ADD COLUMN code text;
UPDATE public.store_invites SET code=upper(left(replace(token::text,'-',''),16));
CREATE UNIQUE INDEX store_invites_code_idx ON public.store_invites(code) WHERE code IS NOT NULL;

CREATE FUNCTION public.get_or_create_store_invite_code(p_store_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION '관리자만 초대할 수 있습니다'; END IF;
  PERFORM 1 FROM public.stores WHERE id=p_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '관리자만 초대할 수 있습니다'; END IF;
  SELECT code INTO result FROM public.store_invites WHERE store_id=p_store_id AND revoked_at IS NULL AND expires_at>now() AND code IS NOT NULL ORDER BY created_at DESC LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;
  result:=upper(left(replace(gen_random_uuid()::text,'-',''),16));
  INSERT INTO public.store_invites(store_id,created_by,code) VALUES(p_store_id,auth.uid(),result);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_or_create_store_invite_code(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_store_invite_code(uuid) TO authenticated;

CREATE FUNCTION public.get_store_invite_code(p_code text) RETURNS TABLE(store_id uuid,store_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE normalized text := upper(regexp_replace(coalesce(p_code,''),'[ -]','','g'));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF normalized !~ '^[0-9A-F]{16}$' THEN RAISE EXCEPTION 'STORE_INVITE_INVALID'; END IF;
  RETURN QUERY SELECT s.id,s.name FROM public.store_invites i JOIN public.stores s ON s.id=i.store_id
    WHERE i.code=normalized AND i.revoked_at IS NULL AND i.expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'STORE_INVITE_INVALID'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.get_store_invite_code(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_store_invite_code(text) TO authenticated;

CREATE FUNCTION public.submit_join_onboarding_code(p_code text,p_name text,p_phone text,p_profile jsonb)
RETURNS TABLE(store_id uuid,store_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE resolved_token uuid; normalized text := upper(regexp_replace(coalesce(p_code,''),'[ -]','','g'));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF normalized !~ '^[0-9A-F]{16}$' THEN RAISE EXCEPTION 'STORE_INVITE_INVALID'; END IF;
  SELECT i.token INTO resolved_token FROM public.store_invites i
    WHERE i.code=normalized AND i.revoked_at IS NULL AND i.expires_at>now();
  IF resolved_token IS NULL THEN RAISE EXCEPTION 'STORE_INVITE_INVALID'; END IF;
  RETURN QUERY SELECT * FROM public.submit_join_onboarding_invite(resolved_token,p_name,p_phone,p_profile);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_join_onboarding_code(text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_join_onboarding_code(text,text,text,jsonb) TO authenticated;
