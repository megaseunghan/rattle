BEGIN;
-- 외부 원문·업체 개인정보와 재처리 기록은 서버 전용이다.
ALTER TABLE public.toss_pending_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.toss_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.toss_pending_installations,public.toss_webhook_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.toss_pending_installations,public.toss_webhook_events TO service_role;
REVOKE ALL ON FUNCTION public.find_store_by_biznum(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.find_store_by_biznum(text) TO service_role;

CREATE OR REPLACE FUNCTION public.process_toss_webhook(p_event_id text,p_event_type text,p_merchant_id text,p_event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE inserted_id text; merchant jsonb:=coalesce(p_event#>'{data,merchant}','{}'::jsonb);
  biz text; target_id uuid; matches integer;
BEGIN
  IF length(coalesce(p_event_id,'')) NOT BETWEEN 1 AND 200 OR length(coalesce(p_event_type,'')) NOT BETWEEN 1 AND 200
    OR length(coalesce(p_merchant_id,'')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'WEBHOOK_INVALID_EVENT'; END IF;
  INSERT INTO toss_webhook_events(event_id,event_type) VALUES(p_event_id,p_event_type)
    ON CONFLICT(event_id) DO NOTHING RETURNING event_id INTO inserted_id;
  IF inserted_id IS NULL THEN RETURN jsonb_build_object('duplicated',true); END IF;
  IF p_event_type='app.installation.created.v1' THEN
    biz:=regexp_replace(coalesce(merchant->>'businessNumber',''),'[^0-9]','','g');
    -- 중복 사업자번호나 다른 가맹점 연결은 임의 덮어쓰기하지 않는다.
    SELECT count(*),min(id::text)::uuid INTO matches,target_id FROM stores
      WHERE biz<>'' AND normalize_biz_number(business_number)=biz;
    IF matches=1 AND EXISTS(SELECT 1 FROM stores WHERE id=target_id AND (toss_merchant_id IS NULL OR toss_merchant_id=p_merchant_id)) THEN
      UPDATE stores SET toss_merchant_id=p_merchant_id WHERE id=target_id AND (toss_merchant_id IS NULL OR toss_merchant_id=p_merchant_id);
      IF NOT FOUND THEN RAISE EXCEPTION 'WEBHOOK_STORE_CHANGED'; END IF;
      UPDATE toss_pending_installations SET status='matched',matched_store_id=target_id WHERE toss_merchant_id=p_merchant_id;
    ELSE
      INSERT INTO toss_pending_installations(toss_merchant_id,business_number,merchant_name,owner_name,phone_number,address,raw_payload,status,matched_store_id)
        VALUES(p_merchant_id,merchant->>'businessNumber',coalesce(merchant->>'name',merchant->>'displayName'),merchant->>'ownerName',
          merchant->>'phoneNumber',merchant->>'address',p_event,'pending',NULL)
        ON CONFLICT(toss_merchant_id) DO UPDATE SET business_number=excluded.business_number,merchant_name=excluded.merchant_name,
          owner_name=excluded.owner_name,phone_number=excluded.phone_number,address=excluded.address,raw_payload=excluded.raw_payload,status='pending',matched_store_id=NULL;
    END IF;
  ELSIF p_event_type='app.installation.deleted.v1' THEN
    UPDATE stores SET toss_merchant_id=NULL WHERE toss_merchant_id=p_merchant_id;
    UPDATE toss_pending_installations SET status='ignored' WHERE toss_merchant_id=p_merchant_id;
  END IF;
  -- 설치·큐 저장과 중복 방지 기록이 함께 성공하거나 함께 롤백된다.
  RETURN jsonb_build_object('duplicated',false);
END $$;
REVOKE ALL ON FUNCTION public.process_toss_webhook(text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_toss_webhook(text,text,text,jsonb) TO service_role;
COMMIT;
