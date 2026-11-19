-- Review priorities 1/2: explicit regular-employee writes and proof-first deletion.
BEGIN;
CREATE OR REPLACE FUNCTION public.evidence_target_access(sid uuid,p uuid,e uuid,r uuid,m text,w boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND public.can_read_store_financials(sid) AND
 EXISTS (SELECT 1 FROM public.stores WHERE id=sid AND deleted_at IS NULL) AND
 CASE WHEN p IS NOT NULL AND e IS NULL AND r IS NULL AND m IS NULL THEN
   EXISTS(SELECT 1 FROM public.purchases WHERE id=p AND store_id=sid) AND
   (NOT w OR public.is_store_admin(sid) OR EXISTS(
     SELECT 1 FROM public.employees employee JOIN public.store_members member
       ON member.store_id=employee.store_id AND member.user_id=employee.user_id
     WHERE employee.store_id=sid AND employee.user_id=auth.uid() AND employee.is_active
       AND employee.employment_type='regular' AND member.status='approved'))
 WHEN e IS NOT NULL AND p IS NULL AND r IS NULL AND m IS NULL THEN
   EXISTS(SELECT 1 FROM public.expenses WHERE id=e AND store_id=sid) AND (NOT w OR public.is_store_admin(sid))
 WHEN r IS NOT NULL AND p IS NULL AND e IS NULL AND m ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
   EXISTS(SELECT 1 FROM public.recurring_fixed_expenses WHERE id=r AND store_id=sid) AND public.is_store_admin(sid)
 ELSE false END
$$;
-- Also install the standard guards when evidence is imported after store soft deletion.
DROP POLICY IF EXISTS deleted_store_guard_store_id ON public.transaction_evidence;
CREATE POLICY deleted_store_guard_store_id ON public.transaction_evidence AS RESTRICTIVE FOR ALL TO authenticated
 USING (NOT (store_id = ANY (COALESCE((SELECT public.deleted_store_ids()), '{}'::uuid[]))))
 WITH CHECK (NOT (store_id = ANY (COALESCE((SELECT public.deleted_store_ids()), '{}'::uuid[]))));
DROP TRIGGER IF EXISTS guard_deleted_store_store_id ON public.transaction_evidence;
CREATE TRIGGER guard_deleted_store_store_id BEFORE INSERT OR UPDATE ON public.transaction_evidence
 FOR EACH ROW EXECUTE FUNCTION public.guard_deleted_store_write('store_id');

-- RESTRICT is also a backstop for old clients, direct SQL and upload/delete races.
ALTER TABLE public.transaction_evidence DROP CONSTRAINT transaction_evidence_purchase_id_fkey,
 DROP CONSTRAINT transaction_evidence_expense_id_fkey, DROP CONSTRAINT transaction_evidence_recurring_rule_id_fkey,
 DROP CONSTRAINT transaction_evidence_store_id_fkey;
ALTER TABLE public.transaction_evidence
 ADD CONSTRAINT transaction_evidence_purchase_id_fkey FOREIGN KEY(purchase_id) REFERENCES public.purchases(id) ON DELETE RESTRICT,
 ADD CONSTRAINT transaction_evidence_expense_id_fkey FOREIGN KEY(expense_id) REFERENCES public.expenses(id) ON DELETE RESTRICT,
 ADD CONSTRAINT transaction_evidence_recurring_rule_id_fkey FOREIGN KEY(recurring_rule_id) REFERENCES public.recurring_fixed_expenses(id) ON DELETE RESTRICT,
 ADD CONSTRAINT transaction_evidence_store_id_fkey FOREIGN KEY(store_id) REFERENCES public.stores(id) ON DELETE RESTRICT;

-- Lock the metadata row in the same transaction as each Storage object write.
-- Metadata cleanup FOR UPDATE then serializes with in-flight pending uploads.
CREATE FUNCTION public.evidence_object_write_access(object_name text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.transaction_evidence; file_id text:=split_part(object_name,'/',2);
BEGIN
 IF file_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN RETURN false; END IF;
 SELECT * INTO f FROM public.transaction_evidence WHERE id=file_id::uuid FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN f.status='pending' AND f.created_by=auth.uid()
 AND coalesce(public.evidence_target_access(f.store_id,f.purchase_id,f.expense_id,f.recurring_rule_id,f.occurrence_month,true),false)
 AND (object_name=f.store_id::text||'/'||f.id::text||'/'||CASE WHEN f.mime_type='application/pdf' THEN 'document.pdf' ELSE 'image.jpg' END
 OR (f.mime_type='image/jpeg' AND object_name=f.store_id::text||'/'||f.id::text||'/thumb.jpg'));
END $$;
REVOKE ALL ON FUNCTION public.evidence_object_write_access(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.evidence_object_write_access(text) TO authenticated;
DROP POLICY evidence_object_insert ON storage.objects;
DROP POLICY evidence_insert_gate ON storage.objects;
DROP POLICY evidence_object_update ON storage.objects;
DROP POLICY evidence_update_gate ON storage.objects;
CREATE POLICY evidence_object_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='transaction-evidence' AND public.evidence_object_write_access(name));
CREATE POLICY evidence_insert_gate ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'transaction-evidence' OR public.evidence_object_write_access(name));
CREATE POLICY evidence_object_update ON storage.objects FOR UPDATE TO authenticated
 USING(bucket_id='transaction-evidence' AND public.evidence_object_write_access(name))
 WITH CHECK(bucket_id='transaction-evidence' AND public.evidence_object_write_access(name));
CREATE POLICY evidence_update_gate ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'transaction-evidence' OR public.evidence_object_write_access(name))
 WITH CHECK(bucket_id<>'transaction-evidence' OR public.evidence_object_write_access(name));

-- Qualify the outer Storage object name: unqualified name resolves to f.name in the subquery.
DROP POLICY evidence_object_delete ON storage.objects;
DROP POLICY evidence_delete_gate ON storage.objects;
CREATE POLICY evidence_object_delete ON storage.objects FOR DELETE TO authenticated USING (
 bucket_id='transaction-evidence' AND EXISTS(SELECT 1 FROM public.transaction_evidence f WHERE
 (storage.objects.name=f.store_id::text||'/'||f.id::text||'/image.jpg' OR storage.objects.name=f.store_id::text||'/'||f.id::text||'/thumb.jpg' OR storage.objects.name=f.store_id::text||'/'||f.id::text||'/document.pdf')
 AND public.evidence_target_access(f.store_id,f.purchase_id,f.expense_id,f.recurring_rule_id,f.occurrence_month,true)
 AND (f.created_by=(select auth.uid()) OR public.is_store_admin(f.store_id))));
CREATE POLICY evidence_delete_gate ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (
 bucket_id<>'transaction-evidence' OR EXISTS(SELECT 1 FROM public.transaction_evidence f WHERE
 (storage.objects.name=f.store_id::text||'/'||f.id::text||'/image.jpg' OR storage.objects.name=f.store_id::text||'/'||f.id::text||'/thumb.jpg' OR storage.objects.name=f.store_id::text||'/'||f.id::text||'/document.pdf')
 AND public.evidence_target_access(f.store_id,f.purchase_id,f.expense_id,f.recurring_rule_id,f.occurrence_month,true)
 AND (f.created_by=(select auth.uid()) OR public.is_store_admin(f.store_id))));

CREATE FUNCTION public.get_evidence_for_parent_delete(p_kind text,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid; result jsonb;
BEGIN
 IF p_kind='purchase' THEN
  SELECT store_id INTO sid FROM public.purchases WHERE id=p_id;
  IF NOT coalesce(public.evidence_target_access(sid,p_id,NULL,NULL,NULL,true),false) THEN
    -- With no attachments there is nothing to clean. The parent DELETE still uses its own RLS.
    IF public.evidence_target_access(sid,p_id,NULL,NULL,NULL,false) AND NOT EXISTS (
      SELECT 1 FROM public.transaction_evidence WHERE purchase_id=p_id
    ) THEN RETURN '[]'::jsonb; END IF;
    RAISE EXCEPTION 'EVIDENCE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
 ELSIF p_kind='expense' THEN
  SELECT store_id INTO sid FROM public.expenses WHERE id=p_id;
  IF NOT coalesce(public.evidence_target_access(sid,NULL,p_id,NULL,NULL,true),false) THEN
    -- With no attachments there is nothing to clean. The parent DELETE still uses its own RLS.
    IF public.evidence_target_access(sid,NULL,p_id,NULL,NULL,false) AND NOT EXISTS (
      SELECT 1 FROM public.transaction_evidence WHERE expense_id=p_id
    ) THEN RETURN '[]'::jsonb; END IF;
    RAISE EXCEPTION 'EVIDENCE_FORBIDDEN' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.recurring_fixed_expenses WHERE source_expense_id=p_id) THEN RAISE EXCEPTION 'RECURRING_EXPENSE_SOURCE_LOCKED'; END IF;
 ELSIF p_kind='recurring' THEN
  SELECT store_id INTO sid FROM public.recurring_fixed_expenses WHERE id=p_id;
  IF sid IS NULL OR NOT public.is_store_admin(sid) THEN RAISE EXCEPTION 'EVIDENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
  -- Current recurring product preserves versions and has no physical deletion flow.
  IF EXISTS(SELECT 1 FROM public.recurring_fixed_expense_versions WHERE rule_id=p_id) THEN RAISE EXCEPTION 'RECURRING_EXPENSE_SOURCE_LOCKED'; END IF;
 ELSE RAISE EXCEPTION 'EVIDENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.transaction_evidence f WHERE
 (p_kind='purchase' AND f.purchase_id=p_id OR p_kind='expense' AND f.expense_id=p_id OR p_kind='recurring' AND f.recurring_rule_id=p_id)
 AND f.created_by<>auth.uid() AND NOT public.is_store_admin(sid)) THEN RAISE EXCEPTION 'EVIDENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.created_at,f.id),'[]'::jsonb) INTO result FROM public.transaction_evidence f
 WHERE p_kind='purchase' AND f.purchase_id=p_id OR p_kind='expense' AND f.expense_id=p_id OR p_kind='recurring' AND f.recurring_rule_id=p_id;
 RETURN result;
END $$;
CREATE FUNCTION public.discard_transaction_evidence_metadata(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE f public.transaction_evidence; base text;
BEGIN
 SELECT * INTO f FROM public.transaction_evidence WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN; END IF;
 IF NOT coalesce(public.evidence_target_access(f.store_id,f.purchase_id,f.expense_id,f.recurring_rule_id,f.occurrence_month,true),false)
 OR (f.created_by<>auth.uid() AND NOT public.is_store_admin(f.store_id)) THEN RAISE EXCEPTION 'EVIDENCE_FORBIDDEN' USING ERRCODE='42501'; END IF;
 base:=f.store_id::text||'/'||f.id::text||'/';
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name IN(base||'image.jpg',base||'thumb.jpg',base||'document.pdf')) THEN
 RAISE EXCEPTION 'EVIDENCE_FILES_REMAIN'; END IF;
 DELETE FROM public.transaction_evidence WHERE id=p_id;
END $$;
REVOKE DELETE ON public.transaction_evidence FROM authenticated;
REVOKE ALL ON FUNCTION public.get_evidence_for_parent_delete(text,uuid),public.discard_transaction_evidence_metadata(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_evidence_for_parent_delete(text,uuid),public.discard_transaction_evidence_metadata(uuid) TO authenticated;
ALTER POLICY evidence_read ON public.transaction_evidence USING (
 public.evidence_target_access(store_id,purchase_id,expense_id,recurring_rule_id,occurrence_month,false)
 AND (status='ready' OR created_by=(select auth.uid()) OR public.is_store_admin(store_id)));
ALTER POLICY evidence_delete ON public.transaction_evidence USING (
 public.evidence_target_access(store_id,purchase_id,expense_id,recurring_rule_id,occurrence_month,true)
 AND (created_by=(select auth.uid()) OR public.is_store_admin(store_id)));
COMMIT;
