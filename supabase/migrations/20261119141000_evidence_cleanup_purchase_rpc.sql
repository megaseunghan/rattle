-- Follow-up to the unapplied review_fixes migration. No scheduled cleanup.
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

-- Per-object retry lease: one permanently failing path cannot starve later paths.
CREATE TABLE private.evidence_purge_attempts (
 path text PRIMARY KEY, attempted_at timestamptz NOT NULL
);
REVOKE ALL ON private.evidence_purge_attempts FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.claim_expired_evidence_paths() RETURNS SETOF text
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 WITH batch AS (
   SELECT o.name FROM storage.objects o JOIN public.stores s ON s.id::text=split_part(o.name,'/',1)
   LEFT JOIN private.evidence_purge_attempts a ON a.path=o.name
   WHERE o.bucket_id='transaction-evidence' AND s.deleted_at IS NOT NULL AND s.purge_after<=now()
     AND (a.path IS NULL OR a.attempted_at < now()-interval '5 minutes')
   ORDER BY a.attempted_at NULLS FIRST,s.purge_after,o.name LIMIT 100 FOR UPDATE OF o SKIP LOCKED
 )
 INSERT INTO private.evidence_purge_attempts SELECT name,now() FROM batch
 ON CONFLICT(path) DO UPDATE SET attempted_at=excluded.attempted_at RETURNING path;
$$;
REVOKE ALL ON FUNCTION public.claim_expired_evidence_paths() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_evidence_paths() TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_deleted_stores()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target uuid; purged integer := 0;
BEGIN
  PERFORM set_config('rattle.store_purge', 'on', true);
  FOR target IN
    SELECT id FROM public.stores WHERE deleted_at IS NOT NULL AND purge_after <= now()
    ORDER BY purge_after FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      -- Wait for physical deletion through the Storage API, even after a failed batch.
      IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence'
                 AND name LIKE target::text || '/%') THEN CONTINUE; END IF;
      DELETE FROM private.evidence_purge_attempts WHERE path LIKE target::text || '/%';
      DELETE FROM public.transaction_evidence WHERE store_id=target;
      DELETE FROM public.recurring_fixed_expense_versions v
        USING public.recurring_fixed_expenses r WHERE v.rule_id = r.id AND r.store_id = target;
      DELETE FROM public.recurring_fixed_expenses WHERE store_id = target;
      DELETE FROM public.payroll WHERE store_id = target;
      DELETE FROM public.payroll_work_submissions WHERE store_id = target;
      DELETE FROM public.payroll_daily_work_history WHERE store_id = target;
      DELETE FROM public.payroll_daily_work WHERE store_id = target;
      DELETE FROM public.stores WHERE id = target AND deleted_at IS NOT NULL AND purge_after <= now();
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


-- Vault entries contain the project's HTTPS URL and a dedicated scheduler secret.
-- The Edge endpoint validates that secret and ignores caller-supplied paths.
DO $schedule$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
   PERFORM cron.schedule('rattle-expired-evidence-storage','*/5 * * * *',$job$
     SELECT net.http_post(url:=rtrim(u.decrypted_secret,'/')||'/functions/v1/evidence-purge',
       headers:=jsonb_build_object('x-evidence-purge-token',t.decrypted_secret),body:='{}'::jsonb)
     FROM vault.decrypted_secrets u,vault.decrypted_secrets t
     WHERE u.name='evidence_project_url' AND t.name='evidence_purge_token'
       AND EXISTS(SELECT 1 FROM public.stores WHERE deleted_at IS NOT NULL AND purge_after<=now())
   $job$);
 END IF;
END $schedule$;
COMMIT;
