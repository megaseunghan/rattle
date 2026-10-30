BEGIN;
-- Stable taxonomy IDs; text labels and store arrays remain compatible with released clients.
CREATE TABLE public.store_taxonomies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
 domain text NOT NULL CHECK(domain IN ('ingredient','purchase','purchase_type')),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 40), sort_order integer NOT NULL DEFAULT 0,
 is_active boolean NOT NULL DEFAULT true, UNIQUE(store_id,domain,name)
);
ALTER TABLE public.store_taxonomies ENABLE ROW LEVEL SECURITY;
CREATE POLICY taxonomy_member_read ON public.store_taxonomies FOR SELECT TO authenticated USING(public.is_store_member(store_id));
GRANT SELECT ON public.store_taxonomies TO authenticated;
ALTER TABLE public.ingredients ADD COLUMN category_id uuid REFERENCES public.store_taxonomies(id);
ALTER TABLE public.purchases ADD COLUMN category_id uuid REFERENCES public.store_taxonomies(id), ADD COLUMN purchase_type_id uuid REFERENCES public.store_taxonomies(id);
ALTER TABLE public.purchase_items ADD COLUMN category_id uuid REFERENCES public.store_taxonomies(id);
-- Each purchase item keeps its own classification; mixed-category purchases must not inherit the representative parent category.
INSERT INTO public.store_taxonomies(store_id,domain,name,sort_order)
SELECT s.id,d.domain,btrim(n.name),min(n.ord)::integer FROM public.stores s
CROSS JOIN LATERAL (VALUES('ingredient',ARRAY(SELECT jsonb_array_elements_text(s.categories))),('purchase',s.purchase_categories),('purchase_type',s.purchase_types)) d(domain,names)
CROSS JOIN LATERAL unnest(d.names) WITH ORDINALITY n(name,ord)
WHERE length(btrim(n.name)) BETWEEN 1 AND 40 GROUP BY s.id,d.domain,btrim(n.name);
INSERT INTO public.store_taxonomies(store_id,domain,name,is_active)
SELECT DISTINCT store_id,domain,name,false FROM (
 SELECT store_id,'ingredient' AS domain,btrim(category) AS name FROM public.ingredients
 UNION ALL SELECT store_id,'purchase',btrim(category) FROM public.purchases
 UNION ALL SELECT store_id,'purchase_type',btrim(type) FROM public.purchases
 UNION ALL SELECT store_id,'purchase',btrim(category) FROM public.purchase_items
) x WHERE length(name) BETWEEN 1 AND 40 ON CONFLICT DO NOTHING;
UPDATE public.ingredients i SET category_id=t.id FROM public.store_taxonomies t WHERE t.store_id=i.store_id AND t.domain='ingredient' AND t.name=btrim(i.category);
UPDATE public.purchases p SET category_id=t.id FROM public.store_taxonomies t WHERE t.store_id=p.store_id AND t.domain='purchase' AND t.name=btrim(p.category);
UPDATE public.purchases p SET purchase_type_id=t.id FROM public.store_taxonomies t WHERE t.store_id=p.store_id AND t.domain='purchase_type' AND t.name=btrim(p.type);
UPDATE public.purchase_items i SET category_id=t.id FROM public.store_taxonomies t WHERE t.store_id=i.store_id AND t.domain='purchase' AND t.name=btrim(i.category);

CREATE FUNCTION public.resolve_store_taxonomy(p_store_id uuid,p_domain text,p_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result uuid;
BEGIN
 IF p_name IS NULL OR btrim(p_name)='' THEN RETURN NULL; END IF;
 SELECT id INTO result FROM public.store_taxonomies WHERE store_id=p_store_id AND domain=p_domain AND name=btrim(p_name);
 IF FOUND THEN RETURN result; END IF;
 INSERT INTO public.store_taxonomies(store_id,domain,name,is_active) VALUES(p_store_id,p_domain,btrim(p_name),false)
 ON CONFLICT(store_id,domain,name) DO UPDATE SET name=excluded.name RETURNING id INTO result;
 RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.resolve_store_taxonomy(uuid,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.sync_taxonomy_labels() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE domain_name text; label text; tid uuid; parent_store uuid;
BEGIN
 IF TG_TABLE_NAME='purchase_items' THEN
  SELECT p.store_id INTO parent_store FROM public.purchases p WHERE p.id=NEW.purchase_id;
  IF parent_store IS DISTINCT FROM NEW.store_id THEN RAISE EXCEPTION 'TAXONOMY_STORE_MISMATCH'; END IF;
 END IF;
 domain_name:=CASE WHEN TG_TABLE_NAME='ingredients' THEN 'ingredient' ELSE 'purchase' END;
 IF NEW.category_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.category_id IS DISTINCT FROM OLD.category_id) THEN
  SELECT t.name INTO label FROM public.store_taxonomies t WHERE t.id=NEW.category_id AND t.store_id=NEW.store_id AND t.domain=domain_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_STORE_MISMATCH'; END IF;
  NEW.category:=label;
 ELSE
  NEW.category_id:=public.resolve_store_taxonomy(NEW.store_id,domain_name,NEW.category);
 END IF;
 IF TG_TABLE_NAME='purchases' THEN
  IF NEW.purchase_type_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.purchase_type_id IS DISTINCT FROM OLD.purchase_type_id) THEN
   SELECT t.name INTO label FROM public.store_taxonomies t WHERE t.id=NEW.purchase_type_id AND t.store_id=NEW.store_id AND t.domain='purchase_type';
   IF NOT FOUND THEN RAISE EXCEPTION 'TAXONOMY_STORE_MISMATCH'; END IF;
   NEW.type:=label;
  ELSE NEW.purchase_type_id:=public.resolve_store_taxonomy(NEW.store_id,'purchase_type',NEW.type); END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_taxonomy_labels() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER a_sync_taxonomy_labels BEFORE INSERT OR UPDATE OF category,category_id,store_id ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.sync_taxonomy_labels();
CREATE TRIGGER a_sync_taxonomy_labels BEFORE INSERT OR UPDATE OF category,category_id,type,purchase_type_id,store_id ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.sync_taxonomy_labels();
CREATE TRIGGER a_sync_taxonomy_labels BEFORE INSERT OR UPDATE OF purchase_id,store_id,category_id,category ON public.purchase_items FOR EACH ROW EXECUTE FUNCTION public.sync_taxonomy_labels();
CREATE FUNCTION public.sync_store_taxonomy_arrays() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d record; n record;
BEGIN
 FOR d IN SELECT * FROM (VALUES('ingredient',ARRAY(SELECT jsonb_array_elements_text(NEW.categories))),('purchase',NEW.purchase_categories),('purchase_type',NEW.purchase_types)) x(domain,names) LOOP
  UPDATE public.store_taxonomies SET is_active=false WHERE store_id=NEW.id AND domain=d.domain;
  FOR n IN SELECT btrim(name) name,min(ord)::integer ord FROM unnest(d.names) WITH ORDINALITY x(name,ord) GROUP BY btrim(name) LOOP
   INSERT INTO public.store_taxonomies(store_id,domain,name,sort_order,is_active) VALUES(NEW.id,d.domain,n.name,n.ord,true)
   ON CONFLICT(store_id,domain,name) DO UPDATE SET sort_order=excluded.sort_order,is_active=true;
  END LOOP;
 END LOOP;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.sync_store_taxonomy_arrays() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_store_taxonomy_arrays AFTER INSERT OR UPDATE OF categories,purchase_categories,purchase_types ON public.stores FOR EACH ROW EXECUTE FUNCTION public.sync_store_taxonomy_arrays();

CREATE FUNCTION public.change_store_taxonomy(p_store_id uuid,p_domain text,p_old_name text DEFAULT NULL,p_new_name text DEFAULT NULL,p_action text DEFAULT 'rename')
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old_id uuid; fallback_id uuid; names text[]; new_name text:=btrim(p_new_name);
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION 'TAXONOMY_FORBIDDEN'; END IF;
 IF p_domain IS NULL OR p_action IS NULL OR p_domain NOT IN ('ingredient','purchase','purchase_type') OR p_action NOT IN ('add','rename','remove') THEN RAISE EXCEPTION 'INVALID_TAXONOMY_ACTION'; END IF;
 PERFORM 1 FROM public.stores WHERE id=p_store_id FOR UPDATE;
 IF p_action<>'remove' AND (new_name IS NULL OR length(new_name) NOT BETWEEN 1 AND 40 OR new_name='전체') THEN RAISE EXCEPTION 'INVALID_TAXONOMY_NAME'; END IF;
 IF p_action IN ('rename','remove') THEN
  SELECT id INTO old_id FROM public.store_taxonomies WHERE store_id=p_store_id AND domain=p_domain AND name=p_old_name AND is_active FOR UPDATE;
  IF old_id IS NULL THEN RAISE EXCEPTION 'TAXONOMY_CHANGED'; END IF;
 END IF;
 IF p_action='add' THEN
  INSERT INTO public.store_taxonomies(store_id,domain,name,sort_order) VALUES(p_store_id,p_domain,new_name,(SELECT coalesce(max(sort_order),0)+1 FROM public.store_taxonomies WHERE store_id=p_store_id AND domain=p_domain))
  ON CONFLICT(store_id,domain,name) DO UPDATE SET is_active=true;
 ELSIF p_action='rename' THEN
  IF new_name<>p_old_name THEN
   UPDATE public.store_taxonomies SET name=new_name WHERE id=old_id;
   IF p_domain='ingredient' THEN UPDATE public.ingredients SET category=new_name WHERE category_id=old_id;
   ELSIF p_domain='purchase' THEN
    UPDATE public.purchases SET category=new_name WHERE category_id=old_id;
    UPDATE public.purchase_items SET category=new_name WHERE category_id=old_id;
   ELSE
    -- Existing type validator needs the new label before rewriting history.
    UPDATE public.stores SET purchase_types=array_replace(purchase_types,p_old_name,new_name) WHERE id=p_store_id;
    UPDATE public.purchases SET type=new_name WHERE purchase_type_id=old_id;
   END IF;
  END IF;
 ELSE
  IF p_domain='purchase_type' THEN
   IF EXISTS(SELECT 1 FROM public.purchases WHERE store_id=p_store_id AND purchase_type_id=old_id) THEN RAISE EXCEPTION 'TAXONOMY_IN_USE'; END IF;
  ELSE
   IF p_old_name='기타' THEN RAISE EXCEPTION 'TAXONOMY_FALLBACK_REQUIRED'; END IF;
   fallback_id:=public.resolve_store_taxonomy(p_store_id,p_domain,'기타');
   UPDATE public.store_taxonomies SET is_active=true WHERE id=fallback_id;
   IF p_domain='ingredient' THEN UPDATE public.ingredients SET category_id=fallback_id WHERE category_id=old_id;
   ELSE
    UPDATE public.purchases SET category_id=fallback_id WHERE category_id=old_id;
    UPDATE public.purchase_items SET category_id=fallback_id WHERE category_id=old_id;
   END IF;
  END IF;
  UPDATE public.store_taxonomies SET is_active=false WHERE id=old_id;
 END IF;
 SELECT coalesce(array_agg(name ORDER BY sort_order,name),'{}') INTO names FROM public.store_taxonomies WHERE store_id=p_store_id AND domain=p_domain AND is_active;
 UPDATE public.stores SET categories=CASE WHEN p_domain='ingredient' THEN to_jsonb(names) ELSE categories END,
 purchase_categories=CASE WHEN p_domain='purchase' THEN names ELSE purchase_categories END,
 purchase_types=CASE WHEN p_domain='purchase_type' THEN names ELSE purchase_types END WHERE id=p_store_id;
 RETURN names;
END; $$;
REVOKE ALL ON FUNCTION public.change_store_taxonomy(uuid,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.change_store_taxonomy(uuid,text,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.change_purchase_type(p_store_id uuid,p_old_name text,p_new_name text) RETURNS text[]
LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$ SELECT public.change_store_taxonomy(p_store_id,'purchase_type',p_old_name,p_new_name,CASE WHEN p_old_name IS NULL THEN 'add' ELSE 'rename' END) $$;

-- Atomic wage writes. Never infer past conditions for existing employees.
CREATE FUNCTION public.create_employee_with_initial_wage(p_store_id uuid,p_employee jsonb) RETURNS SETOF public.employees
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.employees; v public.employees;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION 'EMPLOYEE_FORBIDDEN'; END IF;
 v:=jsonb_populate_record(NULL::public.employees,p_employee);
 IF btrim(coalesce(v.name,''))='' OR v.employment_type NOT IN ('regular','part_time') OR coalesce(v.base_salary,0)<0 OR coalesce(v.hourly_wage,0)<0 OR coalesce(v.non_taxable,0)<0 OR v.base_salary::text IN ('NaN','Infinity','-Infinity') OR v.hourly_wage::text IN ('NaN','Infinity','-Infinity') OR v.non_taxable::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_CONDITIONS'; END IF;
 INSERT INTO public.employees(store_id,name,employment_type,base_salary,hourly_wage,non_taxable,joined_at,phone,bank_name,account_number,is_probation,probation_started_at,weekly_hours,dependents,user_id,is_active,is_resigned_during_probation)
 VALUES(p_store_id,btrim(v.name),v.employment_type,coalesce(v.base_salary,0),v.hourly_wage,coalesce(v.non_taxable,0),v.joined_at,v.phone,v.bank_name,v.account_number,coalesce(v.is_probation,false),v.probation_started_at,v.weekly_hours,coalesce(v.dependents,1),v.user_id,true,false) RETURNING * INTO e;
 INSERT INTO public.employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable,memo,created_by)
 VALUES(p_store_id,e.id,coalesce(e.joined_at,(now() AT TIME ZONE 'Asia/Seoul')::date),e.base_salary,e.hourly_wage,e.non_taxable,'초기 급여 조건',auth.uid());
 RETURN NEXT e;
END; $$;
CREATE FUNCTION public.add_employee_wage_change(p_employee_id uuid,p_effective_date date,p_base_salary numeric,p_hourly_wage numeric,p_non_taxable numeric,p_memo text)
RETURNS SETOF public.employee_wage_history LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.employees; h public.employee_wage_history; current_h public.employee_wage_history;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=p_employee_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_store_admin(e.store_id) THEN RAISE EXCEPTION 'EMPLOYEE_FORBIDDEN'; END IF;
 IF p_effective_date IS NULL OR p_base_salary IS NULL OR p_base_salary<0 OR coalesce(p_hourly_wage,0)<0 OR p_non_taxable IS NULL OR p_non_taxable<0 OR p_base_salary::text IN ('NaN','Infinity','-Infinity') OR p_hourly_wage::text IN ('NaN','Infinity','-Infinity') OR p_non_taxable::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'INVALID_WAGE_CONDITIONS'; END IF;
 INSERT INTO public.employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable,memo,created_by)
 VALUES(e.store_id,e.id,p_effective_date,p_base_salary,p_hourly_wage,p_non_taxable,p_memo,auth.uid()) RETURNING * INTO h;
 SELECT * INTO current_h FROM public.employee_wage_history WHERE employee_id=e.id AND store_id=e.store_id AND effective_date<=(now() AT TIME ZONE 'Asia/Seoul')::date ORDER BY effective_date DESC,created_at DESC,id DESC LIMIT 1;
 IF FOUND THEN UPDATE public.employees SET base_salary=current_h.base_salary,hourly_wage=current_h.hourly_wage,non_taxable=current_h.non_taxable WHERE id=e.id; END IF;
 RETURN NEXT h;
END; $$;
REVOKE ALL ON FUNCTION public.create_employee_with_initial_wage(uuid,jsonb),public.add_employee_wage_change(uuid,date,numeric,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_employee_with_initial_wage(uuid,jsonb),public.add_employee_wage_change(uuid,date,numeric,numeric,numeric,text) TO authenticated;
CREATE VIEW public.current_employee_wages WITH(security_invoker=true) AS
 SELECT e.id AS employee_id,e.store_id,w.id AS wage_history_id,w.effective_date,w.base_salary,w.hourly_wage,w.non_taxable
 FROM public.employees e LEFT JOIN LATERAL(SELECT h.* FROM public.employee_wage_history h WHERE h.employee_id=e.id AND h.store_id=e.store_id AND h.effective_date<=(now() AT TIME ZONE 'Asia/Seoul')::date ORDER BY h.effective_date DESC,h.created_at DESC,h.id DESC LIMIT 1) w ON true;
GRANT SELECT ON public.current_employee_wages TO authenticated;
CREATE FUNCTION public.unit_base_factor(p_unit text) RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE p_unit WHEN 'mg' THEN 0.000001 WHEN 'g' THEN 0.001 WHEN 'ml' THEN 0.001 WHEN 'mL' THEN 0.001 ELSE 1 END::numeric $$;
CREATE FUNCTION public.recipe_line_cost(p_quantity numeric,p_line_unit text,p_stock_unit text,p_price numeric,p_unit_volume numeric,p_volume_unit text)
RETURNS numeric LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE WHEN p_stock_unit='개' AND p_line_unit<>'개' AND coalesce(p_unit_volume,0)<>0 AND coalesce(p_volume_unit,'')<>''
 THEN p_quantity*public.unit_base_factor(p_line_unit)/public.unit_base_factor(p_volume_unit)/p_unit_volume*coalesce(p_price,0)
 ELSE p_quantity*public.unit_base_factor(p_line_unit)/public.unit_base_factor(p_stock_unit)*coalesce(p_price,0) END $$;
CREATE VIEW public.recipe_costs WITH(security_invoker=true) AS
 SELECT r.id AS recipe_id,r.store_id,coalesce(c.cost,0) AS cost,
 CASE WHEN r.selling_price>0 THEN (r.selling_price-coalesce(c.cost,0))/r.selling_price*100 ELSE 0 END AS margin_rate
 FROM public.recipes r LEFT JOIN LATERAL(SELECT sum(public.recipe_line_cost(ri.quantity,coalesce(ri.unit,i.unit),i.unit,i.last_price,i.unit_volume,i.unit_volume_unit)) cost
 FROM public.recipe_ingredients ri JOIN public.ingredients i ON i.id=ri.ingredient_id AND i.store_id=r.store_id WHERE ri.recipe_id=r.id) c ON true;
GRANT SELECT ON public.recipe_costs TO authenticated;

CREATE FUNCTION public.get_financial_summaries(p_store_ids uuid[],p_year_months text[],p_require_admin boolean DEFAULT false)
RETURNS TABLE(store_id uuid,year_month text,revenue numeric,purchase_cost numeric,labor_cost numeric,fixed_expense numeric,variable_expense numeric,operating_profit numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE missing record;
BEGIN
 IF auth.uid() IS NULL OR p_require_admin IS NULL OR p_store_ids IS NULL OR p_year_months IS NULL
 OR EXISTS(SELECT 1 FROM unnest(p_store_ids) s WHERE s IS NULL OR NOT public.is_store_member(s) OR (p_require_admin AND NOT public.is_store_admin(s))) THEN RAISE EXCEPTION 'FINANCIAL_SUMMARY_FORBIDDEN'; END IF;
 IF cardinality(p_store_ids)>25 OR cardinality(p_year_months)>120 OR EXISTS(SELECT 1 FROM unnest(p_year_months) m WHERE m IS NULL OR m !~ '^[0-9]{4}-(0[1-9]|1[0-2])$') THEN RAISE EXCEPTION 'INVALID_FINANCIAL_PERIOD'; END IF;
 -- Fail closed instead of silently reporting zero labor. Dates before employment are not gaps.
 SELECT e.id AS employee_id,e.store_id,m.target_month INTO missing
 FROM public.employees e JOIN (SELECT DISTINCT unnest(p_store_ids) id) s ON s.id=e.store_id
 CROSS JOIN (SELECT DISTINCT unnest(p_year_months) target_month) m
 WHERE e.is_active AND e.employment_type<>'part_time'
 AND greatest((m.target_month||'-01')::date,coalesce(e.joined_at,(m.target_month||'-01')::date))<=least(((m.target_month||'-01')::date+interval '1 month - 1 day')::date,(now() AT TIME ZONE 'Asia/Seoul')::date)
 AND NOT EXISTS(SELECT 1 FROM public.employee_wage_history h WHERE h.employee_id=e.id AND h.store_id=e.store_id AND h.effective_date<=greatest((m.target_month||'-01')::date,coalesce(e.joined_at,(m.target_month||'-01')::date))) LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION USING MESSAGE='WAGE_HISTORY_REQUIRED',DETAIL=json_build_object('employee_id',missing.employee_id,'store_id',missing.store_id,'year_month',missing.target_month)::text; END IF;
 RETURN QUERY
 WITH requested AS MATERIALIZED (
 SELECT s.id AS sid,m.target_month AS ym,(m.target_month||'-01')::date AS first_day,
 ((m.target_month||'-01')::date+interval '1 month')::date AS next_month,
 coalesce(s.closing_time,'23:00'::time) AS close_at
 FROM public.stores s CROSS JOIN (SELECT DISTINCT unnest(p_year_months) target_month) m WHERE s.id=ANY(p_store_ids)
 ), sales AS (
 SELECT q.sid,q.ym,coalesce(sum(CASE WHEN coalesce(t.card_amount,0)+coalesce(t.cash_amount,0)>0 THEN coalesce(t.card_amount,0)+coalesce(t.cash_amount,0) ELSE coalesce(t.total_amount,0) END),0) r,coalesce(sum(t.card_amount),0) card
 FROM requested q LEFT JOIN public.toss_orders t ON t.store_id=q.sid AND t.status='COMPLETED'
 AND t.order_at>=((q.first_day+q.close_at) AT TIME ZONE 'Asia/Seoul') AND t.order_at<=least((q.next_month+q.close_at) AT TIME ZONE 'Asia/Seoul',now()) GROUP BY q.sid,q.ym
 ), manual AS (
 SELECT q.sid,q.ym,coalesce(sum(m.card_amount),0) card,coalesce(sum(m.cash_amount),0) cash
 FROM requested q LEFT JOIN public.manual_sales m ON m.store_id=q.sid AND m.date>=q.first_day AND m.date<q.next_month GROUP BY q.sid,q.ym
 ), purchases_agg AS (
 SELECT q.sid,q.ym,coalesce(sum(p.amount),0) cost FROM requested q LEFT JOIN public.purchases p ON p.store_id=q.sid AND p.date>=q.first_day AND p.date<q.next_month GROUP BY q.sid,q.ym
 ), fixed_month AS (
 SELECT q.sid,q.ym,max(e.year_month) fixed_ym FROM requested q LEFT JOIN public.expenses e ON e.store_id=q.sid AND e.category='고정비' AND e.year_month<=q.ym GROUP BY q.sid,q.ym
 ), fixed AS (
 SELECT q.sid,q.ym,coalesce(sum(e.amount),0) amount FROM fixed_month q LEFT JOIN public.expenses e ON e.store_id=q.sid AND e.category='고정비' AND e.year_month=q.fixed_ym GROUP BY q.sid,q.ym
 ), variable AS (
 SELECT q.sid,q.ym,coalesce(sum(e.amount),0) amount FROM requested q LEFT JOIN public.expenses e ON e.store_id=q.sid AND e.year_month=q.ym AND e.category IN ('마케팅','시설보수','공과금') GROUP BY q.sid,q.ym
 ), wage_versions AS (
 SELECT DISTINCT ON(h.employee_id,h.effective_date) h.employee_id,h.store_id,h.effective_date,h.base_salary
 FROM public.employee_wage_history h WHERE h.store_id=ANY(p_store_ids)
 ORDER BY h.employee_id,h.effective_date,h.created_at DESC,h.id DESC
 ), wage_ranges AS (
 SELECT w.*,lead(w.effective_date,1,'infinity'::date) OVER(PARTITION BY w.employee_id ORDER BY w.effective_date) AS until_date FROM wage_versions w
 ), employee_daily AS (
 SELECT q.sid,q.ym,e.id,round(sum(w.base_salary *
 (least(q.next_month,w.until_date,(now() AT TIME ZONE 'Asia/Seoul')::date+1)-greatest(q.first_day,w.effective_date,coalesce(e.joined_at,q.first_day)))
 /(q.next_month-q.first_day))*CASE WHEN e.is_resigned_during_probation THEN 0.8 WHEN e.joined_at IS NOT NULL AND now()<((e.joined_at+61)::timestamp AT TIME ZONE 'UTC') THEN 0.9 ELSE 1 END) gross
 FROM requested q JOIN public.employees e ON e.store_id=q.sid AND e.is_active AND e.employment_type<>'part_time'
 JOIN wage_ranges w ON w.employee_id=e.id AND w.store_id=q.sid
 AND greatest(q.first_day,w.effective_date,coalesce(e.joined_at,q.first_day))<least(q.next_month,w.until_date,(now() AT TIME ZONE 'Asia/Seoul')::date+1)
 GROUP BY q.sid,q.ym,e.id,e.is_resigned_during_probation,e.joined_at
 ), regular AS (SELECT sid,ym,sum(gross) gross FROM employee_daily GROUP BY sid,ym), part AS (
 SELECT q.sid,q.ym,coalesce(sum(p.gross),0) gross FROM requested q LEFT JOIN public.payroll p ON p.store_id=q.sid AND p.year_month=q.ym
 LEFT JOIN public.employees e ON e.id=p.employee_id AND e.store_id=p.store_id
 WHERE p.id IS NULL OR e.employment_type='part_time' OR p.applied_hourly_wage IS NOT NULL OR p.work_source='legacy_attendance' GROUP BY q.sid,q.ym
 ), totals AS (
 SELECT q.sid,q.ym,s.r+m.card+m.cash r,p.cost,coalesce(g.gross,0)+coalesce(pt.gross,0) labor,f.amount fixed,v.amount+round((s.card+m.card)*0.0125) variable
 FROM requested q JOIN sales s USING(sid,ym) JOIN manual m USING(sid,ym) JOIN purchases_agg p USING(sid,ym) JOIN fixed f USING(sid,ym) JOIN variable v USING(sid,ym) LEFT JOIN regular g USING(sid,ym) LEFT JOIN part pt USING(sid,ym)
 ) SELECT t.sid,t.ym,t.r,t.cost,t.labor,t.fixed,t.variable,t.r-t.cost-t.labor-t.fixed-t.variable FROM totals t;
END; $$;
REVOKE ALL ON FUNCTION public.get_financial_summaries(uuid[],text[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_financial_summaries(uuid[],text[],boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_home_financial_summary(p_store_id uuid,p_year_month text)
RETURNS TABLE(year_month text,revenue numeric,purchase_cost numeric,labor_cost numeric,fixed_expense numeric,variable_expense numeric,operating_profit numeric)
LANGUAGE sql SECURITY INVOKER SET search_path=public AS $$
 SELECT f.year_month,f.revenue,f.purchase_cost,f.labor_cost,f.fixed_expense,f.variable_expense,f.operating_profit FROM public.get_financial_summaries(ARRAY[p_store_id],ARRAY[p_year_month],false) f $$;
REVOKE ALL ON FUNCTION public.get_home_financial_summary(uuid,text),public.change_purchase_type(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_home_financial_summary(uuid,text),public.change_purchase_type(uuid,text,text) TO authenticated;
-- Never expose pending installation contact details to anonymous callers or unrelated store admins.
DO $$ BEGIN
 IF to_regprocedure('public.list_pending_toss_installations()') IS NOT NULL THEN
 EXECUTE $ddl$CREATE OR REPLACE FUNCTION public.list_pending_toss_installations()
 RETURNS TABLE(toss_merchant_id text,business_number text,merchant_name text,owner_name text,address text,created_at timestamptz)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $body$
 SELECT t.toss_merchant_id,t.business_number,t.merchant_name,t.owner_name,t.address,t.created_at FROM public.toss_pending_installations t
 WHERE t.status='pending' AND auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.stores s WHERE regexp_replace(s.business_number,'[^0-9]','','g')=regexp_replace(t.business_number,'[^0-9]','','g') AND length(regexp_replace(t.business_number,'[^0-9]','','g'))=10 AND public.is_store_admin(s.id)) ORDER BY t.created_at DESC $body$; $ddl$;
 EXECUTE 'REVOKE ALL ON FUNCTION public.list_pending_toss_installations() FROM PUBLIC,anon';
 EXECUTE 'GRANT EXECUTE ON FUNCTION public.list_pending_toss_installations() TO authenticated';
 END IF;
END $$;
COMMIT;
