-- Local implementation only. Apply before the app build; no existing amounts are changed.
BEGIN;
CREATE TABLE public.transaction_evidence (
 id uuid PRIMARY KEY,
 store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 purchase_id uuid REFERENCES public.purchases(id) ON DELETE CASCADE,
 expense_id uuid REFERENCES public.expenses(id) ON DELETE CASCADE,
 recurring_rule_id uuid REFERENCES public.recurring_fixed_expenses(id) ON DELETE CASCADE,
 occurrence_month text,
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
 mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','application/pdf')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')),
 created_by uuid NOT NULL DEFAULT auth.uid(),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(purchase_id,expense_id,recurring_rule_id)=1),
 CHECK((recurring_rule_id IS NULL AND occurrence_month IS NULL) OR
       (recurring_rule_id IS NOT NULL AND occurrence_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'))
);
CREATE INDEX evidence_store ON public.transaction_evidence(store_id);
CREATE INDEX evidence_purchase ON public.transaction_evidence(purchase_id);
CREATE INDEX evidence_expense ON public.transaction_evidence(expense_id);
CREATE INDEX evidence_recurring ON public.transaction_evidence(recurring_rule_id,occurrence_month);

CREATE FUNCTION public.evidence_target_access(sid uuid,p uuid,e uuid,r uuid,m text,w boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND public.can_read_store_financials(sid) AND
 CASE WHEN p IS NOT NULL AND e IS NULL AND r IS NULL AND m IS NULL THEN
   EXISTS(SELECT 1 FROM public.purchases WHERE id=p AND store_id=sid) AND
   (NOT w OR public.is_store_admin(sid) OR NOT public.is_store_part_timer(sid))
 WHEN e IS NOT NULL AND p IS NULL AND r IS NULL AND m IS NULL THEN
   EXISTS(SELECT 1 FROM public.expenses WHERE id=e AND store_id=sid) AND (NOT w OR public.is_store_admin(sid))
 WHEN r IS NOT NULL AND p IS NULL AND e IS NULL AND m ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
   EXISTS(SELECT 1 FROM public.recurring_fixed_expenses WHERE id=r AND store_id=sid) AND public.is_store_admin(sid)
 ELSE false END
$$;
REVOKE ALL ON FUNCTION public.evidence_target_access(uuid,uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.evidence_target_access(uuid,uuid,uuid,uuid,text,boolean) TO authenticated;
ALTER TABLE public.transaction_evidence ENABLE ROW LEVEL SECURITY;
GRANT SELECT,DELETE ON public.transaction_evidence TO authenticated;
CREATE POLICY evidence_read ON public.transaction_evidence FOR SELECT TO authenticated USING (
 public.evidence_target_access(store_id,purchase_id,expense_id,recurring_rule_id,occurrence_month,false)
 AND (status='ready' OR created_by=auth.uid() OR public.is_store_admin(store_id)));
CREATE POLICY evidence_delete ON public.transaction_evidence FOR DELETE TO authenticated USING (
 public.evidence_target_access(store_id,purchase_id,expense_id,recurring_rule_id,occurrence_month,true)
 AND (created_by=auth.uid() OR public.is_store_admin(store_id)));

CREATE FUNCTION public.reserve_transaction_evidence(p_id uuid,p_store_id uuid,p_purchase_id uuid,p_expense_id uuid,p_rule_id uuid,p_month text,p_name text,p_mime text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row public.transaction_evidence;
BEGIN
 IF NOT coalesce(public.evidence_target_access(p_store_id,p_purchase_id,p_expense_id,p_rule_id,p_month,true),false) THEN
 RAISE EXCEPTION 'EVIDENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF p_rule_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM (SELECT active,end_month FROM public.recurring_fixed_expense_versions
     WHERE rule_id=p_rule_id AND effective_month<=p_month ORDER BY effective_month DESC,revision DESC LIMIT 1) v
   WHERE v.active AND (v.end_month IS NULL OR v.end_month>=p_month)) THEN
 RAISE EXCEPTION 'EVIDENCE_NO_OCCURRENCE'; END IF;
 -- Serialize reservations for one parent/month, including simultaneous multi-selection.
 PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(p_purchase_id,p_expense_id,p_rule_id)::text||coalesce(p_month,''),0));
 SELECT * INTO row FROM public.transaction_evidence WHERE id=p_id;
 IF FOUND THEN
  IF row.created_by<>auth.uid() OR row.store_id<>p_store_id OR
   row.purchase_id IS DISTINCT FROM p_purchase_id OR row.expense_id IS DISTINCT FROM p_expense_id OR
   row.recurring_rule_id IS DISTINCT FROM p_rule_id OR row.occurrence_month IS DISTINCT FROM p_month OR row.mime_type<>p_mime THEN
   RAISE EXCEPTION 'EVIDENCE_ID_CONFLICT' USING ERRCODE='42501'; END IF;
  RETURN to_jsonb(row);
 END IF;
 IF (SELECT count(*) FROM public.transaction_evidence WHERE store_id=p_store_id
 AND purchase_id IS NOT DISTINCT FROM p_purchase_id AND expense_id IS NOT DISTINCT FROM p_expense_id
 AND recurring_rule_id IS NOT DISTINCT FROM p_rule_id AND occurrence_month IS NOT DISTINCT FROM p_month)>=10 THEN
 RAISE EXCEPTION 'EVIDENCE_LIMIT'; END IF;
 INSERT INTO public.transaction_evidence(id,store_id,purchase_id,expense_id,recurring_rule_id,occurrence_month,name,mime_type)
 VALUES(p_id,p_store_id,p_purchase_id,p_expense_id,p_rule_id,p_month,p_name,p_mime) RETURNING * INTO row;
 RETURN to_jsonb(row);
END $$;
REVOKE ALL ON FUNCTION public.reserve_transaction_evidence(uuid,uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reserve_transaction_evidence(uuid,uuid,uuid,uuid,uuid,text,text,text) TO authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('transaction-evidence','transaction-evidence',false,10485760,ARRAY['image/jpeg','application/pdf']);
-- A policy resolves the complete path through its reserved metadata, never a client-supplied store prefix alone.
CREATE FUNCTION public.evidence_object_access(object_name text,w boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.transaction_evidence f WHERE
 f.id=CASE WHEN split_part(object_name,'/',2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN split_part(object_name,'/',2)::uuid END
 AND (object_name=f.store_id::text||'/'||f.id::text||'/'||CASE WHEN f.mime_type='application/pdf' THEN 'document.pdf' ELSE 'image.jpg' END
 OR (f.mime_type='image/jpeg' AND object_name=f.store_id::text||'/'||f.id::text||'/thumb.jpg'))
 AND public.evidence_target_access(f.store_id,f.purchase_id,f.expense_id,f.recurring_rule_id,f.occurrence_month,w)
 AND CASE WHEN w THEN f.created_by=auth.uid() AND f.status='pending' ELSE f.status='ready' OR f.created_by=auth.uid() OR public.is_store_admin(f.store_id) END)
$$;
REVOKE ALL ON FUNCTION public.evidence_object_access(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.evidence_object_access(text,boolean) TO authenticated;
CREATE POLICY evidence_object_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='transaction-evidence' AND public.evidence_object_access(name,false));
CREATE POLICY evidence_object_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='transaction-evidence' AND public.evidence_object_access(name,true));
CREATE POLICY evidence_object_update ON storage.objects FOR UPDATE TO authenticated
 USING(bucket_id='transaction-evidence' AND public.evidence_object_access(name,true))
 WITH CHECK(bucket_id='transaction-evidence' AND public.evidence_object_access(name,true));
CREATE POLICY evidence_object_delete ON storage.objects FOR DELETE TO authenticated USING (
 bucket_id='transaction-evidence' AND EXISTS(SELECT 1 FROM public.transaction_evidence f WHERE
 (name=f.store_id::text||'/'||f.id::text||'/image.jpg' OR name=f.store_id::text||'/'||f.id::text||'/thumb.jpg' OR name=f.store_id::text||'/'||f.id::text||'/document.pdf')
 AND public.evidence_target_access(f.store_id,f.purchase_id,f.expense_id,f.recurring_rule_id,f.occurrence_month,true)
 AND (f.created_by=auth.uid() OR public.is_store_admin(f.store_id))));

-- Existing broad permissive Storage policies must not bypass this private bucket.
CREATE POLICY evidence_anon_gate ON storage.objects AS RESTRICTIVE FOR ALL TO anon
 USING(bucket_id<>'transaction-evidence') WITH CHECK(bucket_id<>'transaction-evidence');
CREATE POLICY evidence_read_gate ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING(bucket_id<>'transaction-evidence' OR public.evidence_object_access(name,false));
CREATE POLICY evidence_insert_gate ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'transaction-evidence' OR public.evidence_object_access(name,true));
CREATE POLICY evidence_update_gate ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'transaction-evidence' OR public.evidence_object_access(name,true))
 WITH CHECK(bucket_id<>'transaction-evidence' OR public.evidence_object_access(name,true));
CREATE POLICY evidence_delete_gate ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
 USING(bucket_id<>'transaction-evidence' OR EXISTS(SELECT 1 FROM public.transaction_evidence f WHERE
 (name=f.store_id::text||'/'||f.id::text||'/image.jpg' OR name=f.store_id::text||'/'||f.id::text||'/thumb.jpg' OR name=f.store_id::text||'/'||f.id::text||'/document.pdf')
 AND public.evidence_target_access(f.store_id,f.purchase_id,f.expense_id,f.recurring_rule_id,f.occurrence_month,true)
 AND (f.created_by=auth.uid() OR public.is_store_admin(f.store_id))));

CREATE FUNCTION public.finish_transaction_evidence(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row public.transaction_evidence; base text;
BEGIN
 SELECT * INTO row FROM public.transaction_evidence WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR row.created_by<>auth.uid() OR NOT coalesce(public.evidence_target_access(row.store_id,row.purchase_id,row.expense_id,row.recurring_rule_id,row.occurrence_month,true),false) THEN
 RAISE EXCEPTION 'EVIDENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 base:=row.store_id::text||'/'||row.id::text||'/';
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=base||CASE WHEN row.mime_type='application/pdf' THEN 'document.pdf' ELSE 'image.jpg' END)
 OR (row.mime_type='image/jpeg' AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=base||'thumb.jpg')) THEN
 RAISE EXCEPTION 'EVIDENCE_UPLOAD_INCOMPLETE'; END IF;
 UPDATE public.transaction_evidence SET status='ready' WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.finish_transaction_evidence(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finish_transaction_evidence(uuid) TO authenticated;

-- Preserve the existing RPC and its current guards/triggers. New clients need the exact saved ID.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.create_purchase_with_items(uuid,date,text,text,jsonb)'::regprocedure) INTO definition;
 IF position('RETURNING id INTO v_id' in definition)=0 THEN RAISE EXCEPTION 'PURCHASE_RPC_CONTRACT_CHANGED'; END IF;
 definition:=replace(definition,'public.create_purchase_with_items(', 'public.create_purchase_with_evidence(');
 definition:=replace(definition,'RETURNS void','RETURNS uuid');
 definition:=regexp_replace(definition,'END \$function\$', 'RETURN v_id; END $function$');
 IF position('RETURN v_id' in definition)=0 THEN RAISE EXCEPTION 'PURCHASE_RPC_CONTRACT_CHANGED'; END IF;
 EXECUTE definition;
END $migration$;
REVOKE ALL ON FUNCTION public.create_purchase_with_evidence(uuid,date,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_evidence(uuid,date,text,text,jsonb) TO authenticated;
COMMIT;
