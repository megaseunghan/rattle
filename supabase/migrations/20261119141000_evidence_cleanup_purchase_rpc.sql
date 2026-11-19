-- Follow-up to the unapplied review_fixes migration. No scheduled cleanup.
BEGIN;
ALTER TABLE public.transaction_evidence DROP CONSTRAINT transaction_evidence_status_check;
ALTER TABLE public.transaction_evidence ADD CONSTRAINT transaction_evidence_status_check CHECK(status IN ('pending','ready','discarding'));

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
 IF f.status='ready' THEN RAISE EXCEPTION 'EVIDENCE_ALREADY_READY'; END IF;
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
 IF row.status='discarding' THEN RAISE EXCEPTION 'EVIDENCE_DISCARDING'; END IF;
 base:=row.store_id::text||'/'||row.id::text||'/';
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=base||CASE WHEN row.mime_type='application/pdf' THEN 'document.pdf' ELSE 'image.jpg' END)
 OR (row.mime_type='image/jpeg' AND NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='transaction-evidence' AND name=base||'thumb.jpg')) THEN
 RAISE EXCEPTION 'EVIDENCE_UPLOAD_INCOMPLETE'; END IF;
 UPDATE public.transaction_evidence SET status='ready' WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.finish_transaction_evidence(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.finish_transaction_evidence(uuid) TO authenticated;

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
COMMIT;
