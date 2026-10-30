-- After 20261023122000_financial_wage_coverage.sql. No payroll/history writes.
BEGIN;
ALTER TABLE public.stores ADD COLUMN financial_share_scope text NOT NULL DEFAULT 'all_staff'
 CHECK (financial_share_scope IN ('none','regular_only','all_staff'));
-- Existing stores keep sharing; new stores default private, including old clients.
ALTER TABLE public.stores ALTER COLUMN financial_share_scope SET DEFAULT 'none';
ALTER TABLE public.stores ADD COLUMN pos_setup_choice text CHECK(pos_setup_choice IN ('now','later'));
ALTER TABLE public.stores ADD COLUMN setup_request_id uuid;
CREATE UNIQUE INDEX stores_owner_setup_request_unique ON public.stores(owner_id,setup_request_id) WHERE setup_request_id IS NOT NULL;

CREATE FUNCTION public.can_read_store_financials(p_store_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.is_store_admin(p_store_id) OR EXISTS(
 SELECT 1 FROM public.stores s
 JOIN public.store_members m ON m.store_id=s.id AND m.user_id=auth.uid() AND m.status='approved'
 JOIN public.employees e ON e.store_id=s.id AND e.user_id=auth.uid() AND e.is_active AND e.employment_type IN ('regular','part_time')
 WHERE s.id=p_store_id AND (s.financial_share_scope='all_staff' OR
 (s.financial_share_scope='regular_only' AND e.employment_type='regular'))
 ))
$$;
REVOKE ALL ON FUNCTION public.can_read_store_financials(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_store_financials(uuid) TO authenticated;
CREATE FUNCTION public.get_my_store_financial_access(p_store_ids uuid[])
RETURNS TABLE(store_id uuid,allowed boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT s,public.can_read_store_financials(s) FROM (SELECT DISTINCT unnest(p_store_ids) s) q
 WHERE cardinality(p_store_ids)<=100 AND public.is_store_member(s)
$$;
REVOKE ALL ON FUNCTION public.get_my_store_financial_access(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_store_financial_access(uuid[]) TO authenticated;

CREATE FUNCTION public.guard_store_sharing_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (NEW.financial_share_scope IS DISTINCT FROM OLD.financial_share_scope OR
     NEW.pos_setup_choice IS DISTINCT FROM OLD.pos_setup_choice OR
     NEW.setup_request_id IS DISTINCT FROM OLD.setup_request_id)
 AND auth.uid() IS DISTINCT FROM OLD.owner_id THEN RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_store_sharing_owner BEFORE UPDATE ON public.stores
 FOR EACH ROW EXECUTE FUNCTION public.guard_store_sharing_owner();
CREATE FUNCTION public.set_store_financial_sharing(p_store_id uuid,p_scope text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.stores WHERE id=p_store_id AND owner_id=auth.uid()) THEN
 RAISE EXCEPTION 'STORE_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_scope IS NULL OR p_scope NOT IN ('none','regular_only','all_staff') THEN RAISE EXCEPTION 'INVALID_SHARE_SCOPE'; END IF;
 UPDATE public.stores SET financial_share_scope=p_scope WHERE id=p_store_id AND owner_id=auth.uid();
END $$;
CREATE FUNCTION public.create_store_with_setup(p_name text,p_pos_choice text,p_share_scope text,p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.set_store_financial_sharing(uuid,text),public.create_store_with_setup(text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_store_financial_sharing(uuid,text),public.create_store_with_setup(text,text,text,uuid) TO authenticated;

-- Restrictive policies compose with existing member/write policies; they cannot widen access.
DO $policy$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['toss_orders','toss_order_items','manual_sales','purchases','purchase_items','expenses'] LOOP
   EXECUTE format('CREATE POLICY financial_sharing_gate ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.can_read_store_financials(store_id)) WITH CHECK(public.can_read_store_financials(store_id))',t);
 END LOOP;
END $policy$;
CREATE POLICY financial_notification_gate ON public.notifications AS RESTRICTIVE FOR SELECT TO authenticated
 USING ((category NOT IN ('sales','profit') OR public.can_read_store_financials(store_id)) AND (category<>'members' OR public.is_store_admin(store_id)));

-- SECURITY DEFINER aggregates bypass RLS. Strengthen their entry checks in-place,
-- preserving calculation bodies, return types, grants and default arguments.
DO $guards$
DECLARE fn record; definition text; guard text;
BEGIN
 FOR fn IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('get_financial_summaries','get_financial_summaries_v2',
 'get_pos_daily_summaries','get_pos_daily_items','upsert_pos_order_batch','upsert_toss_order_with_items',
 'create_purchase_with_items','update_purchase_item') LOOP
   definition := pg_get_functiondef(fn.oid);
   IF fn.proname IN ('get_financial_summaries','get_financial_summaries_v2') THEN
     guard := 'IF p_store_ids IS NULL OR EXISTS(SELECT 1 FROM unnest(p_store_ids) sid WHERE NOT public.can_read_store_financials(sid)) THEN RAISE EXCEPTION ''FINANCIAL_SHARING_DENIED'' USING ERRCODE=''42501''; END IF;';
   ELSIF fn.proname='update_purchase_item' THEN
     guard := 'IF NOT EXISTS(SELECT 1 FROM public.purchase_items WHERE id=p_item_id AND public.can_read_store_financials(store_id)) THEN RAISE EXCEPTION ''FINANCIAL_SHARING_DENIED'' USING ERRCODE=''42501''; END IF;';
   ELSE
     guard := 'IF NOT public.can_read_store_financials(p_store_id) THEN RAISE EXCEPTION ''FINANCIAL_SHARING_DENIED'' USING ERRCODE=''42501''; END IF;';
   END IF;
   IF definition !~* E'\\mBEGIN\\M' THEN RAISE EXCEPTION 'Unexpected finance function body: %',fn.proname; END IF;
   definition := regexp_replace(definition,E'\\mBEGIN\\M','BEGIN '||guard,'i');
   EXECUTE definition;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.get_financial_summaries(uuid[],text[],boolean)'::regprocedure) THEN RAISE EXCEPTION 'MISSING_FINANCIAL_SUMMARIES'; END IF;
END $guards$;
-- Legacy home endpoint delegates to the guarded summary. Use v2 to retain wage-gap handling.
CREATE OR REPLACE FUNCTION public.get_home_financial_summary(p_store_id uuid,p_year_month text)
RETURNS TABLE(year_month text,revenue numeric,purchase_cost numeric,labor_cost numeric,fixed_expense numeric,variable_expense numeric,operating_profit numeric)
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 SELECT year_month,revenue,purchase_cost,labor_cost,fixed_expense,variable_expense,operating_profit
 FROM public.get_financial_summaries_v2(ARRAY[p_store_id],ARRAY[p_year_month],false)
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
