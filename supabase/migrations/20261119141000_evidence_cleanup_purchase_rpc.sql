-- Requires the evidence review fixes, store soft deletion, Vault, pg_net, pg_cron and pgcrypto.
BEGIN;
ALTER TABLE public.transaction_evidence DROP CONSTRAINT transaction_evidence_status_check;
ALTER TABLE public.transaction_evidence ADD CONSTRAINT transaction_evidence_status_check CHECK(status IN ('pending','ready','discarding','deleting'));

-- Claim cleanup under the same row lock used by finish and Storage writes.
-- Once claimed, writes/finish cannot resurrect the reservation. Retry cleanup on failure.
CREATE FUNCTION public.begin_pending_evidence_discard(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.transaction_evidence;
BEGIN
 SELECT * INTO f FROM public.transaction_evidence WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT coalesce(public.evidence_target_access(f.store_id,f.purchase_id,f.expense_id,f.recurring_rule_id,f.occurrence_month,true),false)
 OR (f.created_by<>auth.uid() AND NOT public.is_store_admin(f.store_id)) THEN
  RAISE EXCEPTION 'EVIDENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF f.status IN ('ready','deleting') THEN RAISE EXCEPTION 'EVIDENCE_ALREADY_READY'; END IF;
 UPDATE public.transaction_evidence SET status='discarding' WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.begin_pending_evidence_discard(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_pending_evidence_discard(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.finish_transaction_evidence(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row public.transaction_evidence; base text;
BEGIN
 SELECT * INTO row FROM public.transaction_evidence WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR row.created_by<>auth.uid() OR NOT coalesce(public.evidence_target_access(row.store_id,row.purchase_id,row.expense_id,row.recurring_rule_id,row.occurrence_month,true),false) THEN
 RAISE EXCEPTION 'EVIDENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF row.status IN ('discarding','deleting') THEN RAISE EXCEPTION 'EVIDENCE_DISCARDING'; END IF;
 base:=row.store_id::text||'/'||row.id::text||'/';
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=base||CASE WHEN row.mime_type='application/pdf' THEN 'document.pdf' ELSE 'image.jpg' END)
 OR (row.mime_type='image/jpeg' AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=base||'thumb.jpg')) THEN
 RAISE EXCEPTION 'EVIDENCE_UPLOAD_INCOMPLETE'; END IF;
 UPDATE public.transaction_evidence SET status='ready' WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.finish_transaction_evidence(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finish_transaction_evidence(uuid) TO authenticated;

CREATE FUNCTION public.begin_ready_evidence_delete(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.transaction_evidence;
BEGIN
 SELECT * INTO f FROM public.transaction_evidence WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT coalesce(public.evidence_target_access(f.store_id,f.purchase_id,f.expense_id,f.recurring_rule_id,f.occurrence_month,true),false)
 OR (f.created_by<>auth.uid() AND NOT public.is_store_admin(f.store_id)) THEN
  RAISE EXCEPTION 'EVIDENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF f.status NOT IN ('ready','deleting') THEN RAISE EXCEPTION 'EVIDENCE_NOT_READY'; END IF;
 UPDATE public.transaction_evidence SET status='deleting' WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.begin_ready_evidence_delete(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.begin_ready_evidence_delete(uuid) TO authenticated;

-- Single purchase-write implementation, preserving item/stock/financial checks.
CREATE OR REPLACE FUNCTION public.create_purchase_with_evidence(p_store_id uuid,p_date date,p_supplier text,p_type text,p_items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item jsonb; v_id uuid; v_total numeric; v_category text;
BEGIN
  IF NOT coalesce(public.can_read_store_financials(p_store_id),false) THEN RAISE EXCEPTION 'FINANCIAL_SHARING_DENIED' USING ERRCODE='42501'; END IF;
  IF NOT public.is_store_member(p_store_id) THEN RAISE EXCEPTION 'PURCHASE_FORBIDDEN'; END IF;
  IF p_date IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;
  -- 같은 재료를 등록하는 동시 요청은 일정한 순서로 잠근다.
  PERFORM 1 FROM ingredients i WHERE i.store_id=p_store_id
    AND i.id IN (SELECT NULLIF(x->>'ingredient_id','')::uuid FROM jsonb_array_elements(p_items) x)
    ORDER BY i.id FOR UPDATE;
  SELECT sum((x->>'quantity')::numeric*(x->>'unit_price')::numeric) INTO v_total FROM jsonb_array_elements(p_items) x;
  IF v_total IS NULL OR v_total::text IN ('NaN','Infinity','-Infinity') OR v_total<0 OR v_total>=1000000000000 THEN
    RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT';
  END IF;
  SELECT map_purchase_category(coalesce(x->>'category','기타')) INTO v_category FROM jsonb_array_elements(p_items) x
    GROUP BY map_purchase_category(coalesce(x->>'category','기타'))
    ORDER BY sum((x->>'quantity')::numeric*(x->>'unit_price')::numeric) DESC LIMIT 1;
  INSERT INTO purchases(store_id,date,supplier,amount,category,type,note)
    VALUES(p_store_id,p_date,coalesce(p_supplier,''),v_total,coalesce(v_category,'기타'),p_type,NULL) RETURNING id INTO v_id;
  FOR v_item IN SELECT x FROM jsonb_array_elements(p_items) x LOOP
    IF length(btrim(coalesce(v_item->>'name',''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;
    INSERT INTO purchase_items(purchase_id,store_id,ingredient_id,name,quantity,unit,unit_price,subtotal,category)
      VALUES(v_id,p_store_id,NULLIF(v_item->>'ingredient_id','')::uuid,btrim(v_item->>'name'),(v_item->>'quantity')::numeric,
      coalesce(v_item->>'unit',''),(v_item->>'unit_price')::numeric,(v_item->>'quantity')::numeric*(v_item->>'unit_price')::numeric,v_item->>'category');
    UPDATE ingredients SET current_stock=current_stock+(v_item->>'quantity')::numeric,last_price=(v_item->>'unit_price')::numeric,updated_at=now()
      WHERE id=NULLIF(v_item->>'ingredient_id','')::uuid AND store_id=p_store_id;
  END LOOP;
  RETURN v_id;
END $$;

-- Old clients retain the void signature and call the same implementation.
CREATE OR REPLACE FUNCTION public.create_purchase_with_items(p_store_id uuid,p_date date,p_supplier text,p_type text,p_items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.create_purchase_with_evidence(p_store_id,p_date,p_supplier,p_type,p_items);
END $$;
REVOKE ALL ON FUNCTION public.create_purchase_with_evidence(uuid,date,text,text,jsonb),public.create_purchase_with_items(uuid,date,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_evidence(uuid,date,text,text,jsonb),public.create_purchase_with_items(uuid,date,text,text,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';

-- A JWT may upload or remove claimed files but cannot issue arbitrary-lived download links.
CREATE POLICY evidence_storage_operation ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING (bucket_id <> 'transaction-evidence' OR storage.allow_any_operation(
   ARRAY['object.upload','object.upload_update','object.delete','object.delete_many']));

-- These files belong to a store. Keep the uploader in transaction_evidence.created_by
-- while removing both generations of Storage's per-user ownership fields.
CREATE FUNCTION private.evidence_store_owned_object() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 NEW.owner := NULL;
 NEW.owner_id := NULL;
 RETURN NEW;
END $$;
CREATE TRIGGER evidence_store_owned BEFORE INSERT OR UPDATE ON storage.objects
 FOR EACH ROW WHEN (NEW.bucket_id='transaction-evidence')
 EXECUTE FUNCTION private.evidence_store_owned_object();
UPDATE storage.objects SET owner=NULL,owner_id=NULL
 WHERE bucket_id='transaction-evidence' AND (owner IS NOT NULL OR owner_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.restore_deleted_store(p_store_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE caller_id uuid := auth.uid(); target public.stores;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'STORE_RESTORE_AUTH_REQUIRED'; END IF;
  SELECT * INTO target FROM public.stores WHERE id = p_store_id AND owner_id = caller_id FOR UPDATE;
  IF NOT FOUND OR target.deleted_at IS NULL THEN RAISE EXCEPTION 'STORE_RESTORE_NOT_FOUND'; END IF;
  IF target.purge_after <= clock_timestamp() THEN RAISE EXCEPTION 'STORE_RESTORE_EXPIRED'; END IF;
  UPDATE public.stores SET deleted_at = NULL, deleted_by = NULL, purge_after = NULL WHERE id = p_store_id;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_deleted_store(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_deleted_store(uuid) TO authenticated;

-- Keep path outcomes independent of storage.objects: Storage may commit its row
-- deletion before a backend error. Only a positive per-path acknowledgement counts.
CREATE TABLE private.evidence_purge_attempts (
 path text PRIMARY KEY,
 store_id uuid NOT NULL,
 object_id uuid NOT NULL,
 object_version text, -- retained for provider-side reconciliation if Storage loses its row
 first_attempted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 attempted_at timestamptz NOT NULL,
 reconciled_at timestamptz,
 reconciled_by text,
 provider_reference text,
 outcome text NOT NULL DEFAULT 'unknown' CHECK (outcome IN ('unknown','failed','confirmed'))
);
CREATE INDEX evidence_purge_unresolved ON private.evidence_purge_attempts(store_id,attempted_at)
 WHERE outcome <> 'confirmed';
REVOKE ALL ON private.evidence_purge_attempts FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.claim_expired_evidence_paths() RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 WITH locked AS MATERIALIZED (
   SELECT s.id,s.purge_after FROM public.stores s
   WHERE s.deleted_at IS NOT NULL AND s.purge_after <= clock_timestamp()
   ORDER BY s.id FOR UPDATE SKIP LOCKED
 ), due AS MATERIALIZED (
   SELECT id FROM locked WHERE purge_after <= clock_timestamp()
 ), candidates AS (
   SELECT o.name AS path,d.id AS store_id,o.id AS object_id,o.version AS object_version,NULL::timestamptz AS attempted_at
   FROM storage.objects o JOIN due d ON d.id::text=split_part(o.name,'/',1)
   WHERE o.bucket_id='transaction-evidence'
     AND NOT EXISTS (SELECT 1 FROM private.evidence_purge_attempts a WHERE a.path=o.name)
   UNION ALL
   SELECT a.path,a.store_id,a.object_id,a.object_version,a.attempted_at FROM private.evidence_purge_attempts a
   JOIN due d ON d.id=a.store_id
   WHERE a.outcome <> 'confirmed' AND a.attempted_at <= clock_timestamp()-interval '5 minutes'
 ), batch AS (
   SELECT path,store_id,object_id,object_version FROM candidates ORDER BY attempted_at NULLS FIRST,path LIMIT 100
 )
 INSERT INTO private.evidence_purge_attempts(path,store_id,object_id,object_version,attempted_at)
 SELECT path,store_id,object_id,object_version,clock_timestamp() FROM batch
 ON CONFLICT(path) DO UPDATE SET attempted_at=excluded.attempted_at
 RETURNING path;
$$;
-- A delayed failed retry must never overwrite an acknowledged deletion.
CREATE FUNCTION public.record_evidence_purge_result(p_path text,p_outcome text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 UPDATE private.evidence_purge_attempts SET outcome=p_outcome
 WHERE path=p_path AND outcome <> 'confirmed';
END $$;
REVOKE ALL ON FUNCTION public.claim_expired_evidence_paths(),public.record_evidence_purge_result(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_evidence_paths(),public.record_evidence_purge_result(text,text)
 TO service_role;

-- Operator-only settlement after the storage provider verifies physical deletion.
-- The immutable object identity and the external case/receipt remain in the ledger.
CREATE FUNCTION private.confirm_reconciled_evidence_purge(
 p_store uuid, p_path text, p_object uuid, p_version text, p_provider_reference text
) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE target public.stores;
BEGIN
 IF nullif(btrim(p_provider_reference),'') IS NULL THEN RAISE EXCEPTION 'EVIDENCE_PROVIDER_REFERENCE_REQUIRED'; END IF;
 SELECT * INTO target FROM public.stores WHERE id=p_store FOR UPDATE;
 IF NOT FOUND OR target.deleted_at IS NULL OR target.purge_after > clock_timestamp() THEN
   RAISE EXCEPTION 'EVIDENCE_STORE_NOT_EXPIRED';
 END IF;
 IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=p_path) THEN
   RAISE EXCEPTION 'EVIDENCE_STORAGE_OBJECT_PRESENT';
 END IF;
 UPDATE private.evidence_purge_attempts
 SET outcome='confirmed',reconciled_at=clock_timestamp(),reconciled_by=current_user,
     provider_reference=btrim(p_provider_reference)
 WHERE store_id=p_store AND path=p_path AND object_id=p_object
   AND object_version IS NOT DISTINCT FROM p_version AND outcome IN ('failed','unknown');
 IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCE_UNRESOLVED_OBJECT_NOT_FOUND'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.confirm_reconciled_evidence_purge(uuid,text,uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_deleted_stores()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target uuid; purged integer := 0;
BEGIN
  PERFORM set_config('rattle.store_purge', 'on', true);
  FOR target IN
    SELECT id FROM public.stores WHERE deleted_at IS NOT NULL AND purge_after <= clock_timestamp()
    ORDER BY id FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Wait for physical deletion through the Storage API, even after a failed batch.
      IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence'
                 AND name LIKE target::text || '/%') THEN CONTINUE; END IF;
      IF EXISTS (SELECT 1 FROM private.evidence_purge_attempts
                 WHERE store_id=target AND outcome <> 'confirmed') THEN CONTINUE; END IF;
      DELETE FROM public.transaction_evidence WHERE store_id=target;
      DELETE FROM public.recurring_fixed_expense_versions v
        USING public.recurring_fixed_expenses r WHERE v.rule_id = r.id AND r.store_id = target;
      DELETE FROM public.recurring_fixed_expenses WHERE store_id = target;
      DELETE FROM public.payroll WHERE store_id = target;
      DELETE FROM public.payroll_work_submissions WHERE store_id = target;
      DELETE FROM public.payroll_daily_work_history WHERE store_id = target;
      DELETE FROM public.payroll_daily_work WHERE store_id = target;
      DELETE FROM public.stores WHERE id = target AND deleted_at IS NOT NULL AND purge_after <= clock_timestamp();
      purged := purged + 1;
    EXCEPTION WHEN OTHERS THEN
      -- 한 매장 실패가 다른 매장 파기를 막지 않게 하고, 다음 실행에서 다시 시도한다.
      INSERT INTO public.store_purge_failures(store_id, sqlstate, message) VALUES (target, SQLSTATE, SQLERRM);
      RAISE WARNING 'STORE_PURGE_FAILED store=% sqlstate=% message=%', target, SQLSTATE, SQLERRM;
    END;
  END LOOP;
  PERFORM set_config('rattle.store_purge', 'off', true);
  RETURN purged;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_deleted_stores() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_deleted_stores() TO service_role;


-- net._http_response is transient. Keep the outcome even when pg_net loses
-- a request or expires its response before the next cron run.
CREATE TABLE private.evidence_purge_requests (
 request_id bigint PRIMARY KEY,
 queued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 result text NOT NULL DEFAULT 'pending' CHECK (result IN ('pending','success','failed','timeout','missing')),
 http_status integer
);
CREATE INDEX evidence_purge_requests_pending ON private.evidence_purge_requests(queued_at) WHERE result='pending';
REVOKE ALL ON private.evidence_purge_requests FROM PUBLIC,anon,authenticated;

-- Retry leases keep moving; measure the unresolved interval from the first claim.
CREATE VIEW private.evidence_purge_alerts WITH (security_invoker=true) AS
 SELECT a.outcome AS issue,a.first_attempted_at AS since,a.store_id,a.path,NULL::bigint AS request_id,NULL::integer AS http_status
 FROM private.evidence_purge_attempts a
 WHERE a.outcome <> 'confirmed' AND a.first_attempted_at <= now()-interval '15 minutes'
 UNION ALL
 SELECT CASE WHEN r.result='pending' THEN 'overdue' ELSE r.result END,
        r.queued_at,NULL::uuid,NULL::text,r.request_id,r.http_status
 FROM private.evidence_purge_requests r
 WHERE r.result IN ('failed','timeout','missing') OR (r.result='pending' AND r.queued_at < now()-interval '2 minutes');
REVOKE ALL ON private.evidence_purge_alerts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.check_evidence_purge_responses() RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 UPDATE private.evidence_purge_requests q
 SET result=CASE WHEN r.timed_out THEN 'timeout'
                 WHEN r.error_msg IS NULL AND r.status_code=204 THEN 'success'
                 ELSE 'failed' END,
     http_status=r.status_code
 FROM net._http_response r WHERE q.result IN ('pending','missing') AND r.id=q.request_id;

 UPDATE private.evidence_purge_requests SET result='missing'
 WHERE result='pending' AND queued_at < clock_timestamp()-interval '2 minutes';
 DELETE FROM private.evidence_purge_requests
 WHERE result='success' AND queued_at < clock_timestamp()-interval '30 days';
END $$;

CREATE FUNCTION private.evidence_purge_config(OUT project_url text, OUT signing_secret text)
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 SELECT rtrim(decrypted_secret,'/') INTO project_url FROM vault.decrypted_secrets WHERE name='evidence_project_url';
 SELECT decrypted_secret INTO signing_secret FROM vault.decrypted_secrets WHERE name='evidence_purge_token';
 IF project_url IS NULL OR project_url !~ '^https://[a-zA-Z0-9.-]+(:[0-9]+)?$'
    OR nullif(btrim(signing_secret),'') IS NULL THEN
   RAISE EXCEPTION 'EVIDENCE_PURGE_VAULT_CONFIGURATION_REQUIRED';
 END IF;
END $$;

CREATE FUNCTION private.dispatch_evidence_purge() RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
DECLARE config record; issued text; signature text; request_id bigint;
BEGIN
 SELECT * INTO config FROM private.evidence_purge_config();
 IF NOT EXISTS (SELECT 1 FROM public.stores WHERE deleted_at IS NOT NULL AND purge_after<=clock_timestamp()) THEN RETURN; END IF;
 issued:=floor(extract(epoch from clock_timestamp()))::bigint::text;
 signature:=encode(extensions.hmac('evidence-purge:'||issued,config.signing_secret,'sha256'),'hex');
 SELECT net.http_post(url:=config.project_url||'/functions/v1/evidence-purge',
   headers:=jsonb_build_object('x-evidence-purge-token',issued||'.'||signature),
   body:='{}'::jsonb,timeout_milliseconds:=60000) INTO request_id;
 INSERT INTO private.evidence_purge_requests(request_id) VALUES(request_id);
END $$;
REVOKE ALL ON FUNCTION private.evidence_purge_config(),private.dispatch_evidence_purge(),
 private.check_evidence_purge_responses() FROM PUBLIC,anon,authenticated,service_role;

-- Fail the entire migration if prerequisites or either schedule are unavailable.
DO $schedule$
BEGIN
 IF to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') IS NULL
    OR to_regclass('net._http_response') IS NULL
    OR to_regprocedure('extensions.hmac(text,text,text)') IS NULL THEN
   RAISE EXCEPTION 'EVIDENCE_PURGE_PG_NET_AND_PGCRYPTO_REQUIRED';
 END IF;
 PERFORM private.evidence_purge_config();
 IF current_setting('cron.launch_active_jobs',true)='off' OR NOT EXISTS (
   SELECT 1 FROM cron.job WHERE jobname='rattle-purge-deleted-stores' AND active
     AND database=current_database() AND schedule='17 3 * * *'
     AND lower(rtrim(btrim(command),';'))='select public.purge_expired_deleted_stores()'
     AND has_function_privilege(username,'public.purge_expired_deleted_stores()','EXECUTE')
 ) THEN RAISE EXCEPTION 'EVIDENCE_DAILY_PURGE_JOB_REQUIRED'; END IF;
 PERFORM cron.schedule('rattle-expired-evidence-storage','*/5 * * * *','SELECT private.dispatch_evidence_purge()');
 PERFORM cron.schedule('rattle-evidence-storage-results','* * * * *','SELECT private.check_evidence_purge_responses()');
END $schedule$;
COMMIT;
