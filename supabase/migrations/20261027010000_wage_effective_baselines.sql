-- Apply before daily work migration. Adds hire-date baseline only where missing; no payroll amounts are rewritten.
BEGIN;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS regular_wage_snapshot jsonb;
-- Effective-date records are append-only through administrator RPCs; old broad write RLS alone is not sufficient.
REVOKE INSERT,UPDATE,DELETE ON public.employee_wage_history FROM authenticated,anon;
-- Freeze the earliest known wage at hire date. Existing effective-date rows and saved payroll remain untouched.
INSERT INTO public.employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable,memo,created_by)
SELECT e.store_id,e.id,e.joined_at,coalesce(w.base_salary,e.base_salary),
 CASE WHEN w.id IS NULL THEN e.hourly_wage ELSE w.hourly_wage END,coalesce(w.non_taxable,e.non_taxable),'입사일 기준 최초 급여',NULL
FROM public.employees e LEFT JOIN LATERAL(
 SELECT h.* FROM public.employee_wage_history h WHERE h.employee_id=e.id AND h.store_id=e.store_id
 ORDER BY h.effective_date,h.created_at DESC,h.id DESC LIMIT 1) w ON true
WHERE e.joined_at IS NOT NULL AND (w.id IS NULL OR w.effective_date>e.joined_at);

CREATE OR REPLACE FUNCTION public.create_employee_with_initial_wage(p_store_id uuid,p_employee jsonb) RETURNS SETOF public.employees
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.employees; v public.employees;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION 'EMPLOYEE_FORBIDDEN'; END IF;
 v:=jsonb_populate_record(NULL::public.employees,p_employee);
 IF v.employment_type IS NULL OR (v.employment_type='part_time' AND (v.hourly_wage IS NULL OR v.hourly_wage<=0)) OR (v.employment_type='regular' AND (v.base_salary IS NULL OR v.base_salary<=0 OR coalesce(v.non_taxable,0)>v.base_salary)) THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_CONDITIONS'; END IF;
 IF v.joined_at IS NULL OR v.joined_at<'1900-01-01'::date OR v.joined_at>'2100-12-31'::date THEN RAISE EXCEPTION 'EMPLOYEE_HIRE_DATE_REQUIRED'; END IF;
 IF btrim(coalesce(v.name,''))='' OR v.employment_type NOT IN ('regular','part_time') OR coalesce(v.base_salary,0)<0 OR coalesce(v.hourly_wage,0)<0 OR coalesce(v.non_taxable,0)<0 OR v.base_salary::text IN ('NaN','Infinity','-Infinity') OR v.hourly_wage::text IN ('NaN','Infinity','-Infinity') OR v.non_taxable::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'INVALID_EMPLOYEE_CONDITIONS'; END IF;
 INSERT INTO public.employees(store_id,name,employment_type,base_salary,hourly_wage,non_taxable,joined_at,phone,bank_name,account_number,is_probation,probation_started_at,weekly_hours,dependents,user_id,is_active,is_resigned_during_probation)
 VALUES(p_store_id,btrim(v.name),v.employment_type,coalesce(v.base_salary,0),v.hourly_wage,coalesce(v.non_taxable,0),v.joined_at,v.phone,v.bank_name,v.account_number,coalesce(v.is_probation,false),v.probation_started_at,v.weekly_hours,coalesce(v.dependents,1),v.user_id,true,false) RETURNING * INTO e;
 INSERT INTO public.employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable,memo,created_by)
 VALUES(p_store_id,e.id,coalesce(e.joined_at,(now() AT TIME ZONE 'Asia/Seoul')::date),e.base_salary,e.hourly_wage,e.non_taxable,'초기 급여 조건',auth.uid());
 RETURN NEXT e;
END; $$;

CREATE OR REPLACE FUNCTION public.add_employee_wage_change(p_employee_id uuid,p_effective_date date,p_base_salary numeric,p_hourly_wage numeric,p_non_taxable numeric,p_memo text)
RETURNS SETOF public.employee_wage_history LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e public.employees; h public.employee_wage_history; current_h public.employee_wage_history; initial_h public.employee_wage_history; start_date date;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=p_employee_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT public.is_store_admin(e.store_id) THEN RAISE EXCEPTION 'EMPLOYEE_FORBIDDEN'; END IF;
 IF p_effective_date IS NULL OR (e.joined_at IS NOT NULL AND p_effective_date<e.joined_at)
 OR p_base_salary IS NULL OR p_base_salary<0 OR coalesce(p_hourly_wage,0)<0 OR p_non_taxable IS NULL OR p_non_taxable<0
 OR p_base_salary::text IN ('NaN','Infinity','-Infinity') OR p_hourly_wage::text IN ('NaN','Infinity','-Infinity') OR p_non_taxable::text IN ('NaN','Infinity','-Infinity')
 OR (e.employment_type='part_time' AND (p_hourly_wage IS NULL OR p_hourly_wage<=0))
 OR (e.employment_type='regular' AND (p_base_salary<=0 OR p_non_taxable>p_base_salary)) THEN RAISE EXCEPTION 'INVALID_WAGE_CONDITIONS'; END IF;
 IF EXISTS(SELECT 1 FROM public.employee_wage_history WHERE employee_id=e.id AND effective_date=p_effective_date) THEN RAISE EXCEPTION 'WAGE_DATE_ALREADY_EXISTS'; END IF;
 start_date:=coalesce(e.joined_at,(e.created_at AT TIME ZONE 'Asia/Seoul')::date);
 SELECT * INTO initial_h FROM public.employee_wage_history WHERE employee_id=e.id AND store_id=e.store_id ORDER BY effective_date,created_at DESC,id DESC LIMIT 1;
 IF start_date<p_effective_date AND (initial_h.id IS NULL OR initial_h.effective_date>start_date) THEN
 INSERT INTO public.employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable,memo,created_by)
 VALUES(e.store_id,e.id,start_date,coalesce(initial_h.base_salary,e.base_salary),CASE WHEN initial_h.id IS NULL THEN e.hourly_wage ELSE initial_h.hourly_wage END,
 coalesce(initial_h.non_taxable,e.non_taxable),'입사일 기준 최초 급여',auth.uid());
 END IF;
 INSERT INTO public.employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable,memo,created_by)
 VALUES(e.store_id,e.id,p_effective_date,p_base_salary,p_hourly_wage,p_non_taxable,p_memo,auth.uid()) RETURNING * INTO h;
 SELECT * INTO current_h FROM public.employee_wage_history WHERE employee_id=e.id AND store_id=e.store_id AND effective_date<=(now() AT TIME ZONE 'Asia/Seoul')::date ORDER BY effective_date DESC,created_at DESC,id DESC LIMIT 1;
 IF FOUND THEN UPDATE public.employees SET base_salary=current_h.base_salary,hourly_wage=current_h.hourly_wage,non_taxable=current_h.non_taxable WHERE id=e.id; END IF;
 RETURN NEXT h;
END $$;
REVOKE ALL ON FUNCTION public.add_employee_wage_change(uuid,date,numeric,numeric,numeric,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_employee_wage_change(uuid,date,numeric,numeric,numeric,text) TO authenticated;

CREATE FUNCTION public.regular_snapshot_gross(p_snapshot jsonb,p_through date DEFAULT NULL) RETURNS numeric
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT round(coalesce(sum((d->>'base_salary')::numeric*(d->>'factor')::numeric/
 extract(day FROM ((p_snapshot->>'year_month')||'-01')::date+interval '1 month - 1 day')),0))
 FROM jsonb_array_elements(p_snapshot->'days') d WHERE p_through IS NULL OR (d->>'date')::date<=p_through
$$;
REVOKE ALL ON FUNCTION public.regular_snapshot_gross(jsonb,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.regular_snapshot_gross(jsonb,date) TO authenticated;

-- Snapshot shape validation; INSERT snapshots are supplied by the administrator calculation flow.
CREATE FUNCTION public.validate_regular_snapshot() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE d jsonb; seen date[]:='{}'; work_day date;
BEGIN
 IF TG_OP='UPDATE' AND OLD.regular_wage_snapshot IS NOT NULL AND NEW.regular_wage_snapshot IS NULL THEN RAISE EXCEPTION 'REGULAR_SNAPSHOT_LEGACY_OVERWRITE'; END IF;
 IF NEW.regular_wage_snapshot IS NULL THEN RETURN NEW; END IF;
 IF to_jsonb(NEW)->'daily_work_snapshot' IS NOT NULL AND to_jsonb(NEW)->'daily_work_snapshot'<>'null'::jsonb THEN RAISE EXCEPTION 'PAYROLL_SNAPSHOT_TYPE_CONFLICT'; END IF;
 IF TG_OP='UPDATE' AND NEW.regular_wage_snapshot IS NOT DISTINCT FROM OLD.regular_wage_snapshot AND NEW.gross IS NOT DISTINCT FROM OLD.gross THEN RETURN NEW; END IF;
 IF NEW.regular_wage_snapshot->>'version' IS DISTINCT FROM '1' OR NEW.regular_wage_snapshot->>'year_month' IS DISTINCT FROM btrim(NEW.year_month)
 OR jsonb_typeof(NEW.regular_wage_snapshot->'days') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'INVALID_REGULAR_SNAPSHOT'; END IF;
 FOR d IN SELECT value FROM jsonb_array_elements(NEW.regular_wage_snapshot->'days') LOOP
   work_day:=(d->>'date')::date;
   IF work_day IS NULL OR to_char(work_day,'YYYY-MM')<>btrim(NEW.year_month) OR work_day=ANY(seen)
   OR (d->>'base_salary') IS NULL OR (d->>'non_taxable') IS NULL OR (d->>'non_taxable')::numeric<0 OR (d->>'non_taxable')::numeric::text IN ('NaN','Infinity','-Infinity') OR (d->>'factor') IS NULL OR (d->>'base_salary')::numeric<0 OR (d->>'factor')::numeric<0
   OR (d->>'base_salary')::numeric::text IN ('NaN','Infinity','-Infinity') OR (d->>'factor')::numeric::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'INVALID_REGULAR_SNAPSHOT'; END IF;
   seen:=array_append(seen,work_day);
 END LOOP;
 IF public.regular_snapshot_gross(NEW.regular_wage_snapshot,NULL) IS DISTINCT FROM NEW.gross THEN RAISE EXCEPTION 'REGULAR_SNAPSHOT_GROSS_MISMATCH'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_regular_snapshot BEFORE INSERT OR UPDATE ON public.payroll FOR EACH ROW EXECUTE FUNCTION public.validate_regular_snapshot();

CREATE OR REPLACE FUNCTION public.get_financial_summaries_v2(p_store_ids uuid[],p_year_months text[],p_require_admin boolean DEFAULT false)
RETURNS TABLE(store_id uuid,year_month text,revenue numeric,purchase_cost numeric,labor_cost numeric,fixed_expense numeric,variable_expense numeric,operating_profit numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_store_ids IS NULL OR EXISTS(SELECT 1 FROM unnest(p_store_ids) sid WHERE NOT public.can_read_store_financials(sid)) THEN RAISE EXCEPTION 'FINANCIAL_SHARING_DENIED' USING ERRCODE='42501'; END IF;
 IF auth.uid() IS NULL OR p_require_admin IS NULL OR p_store_ids IS NULL OR p_year_months IS NULL
 OR EXISTS(SELECT 1 FROM unnest(p_store_ids) s WHERE s IS NULL OR NOT public.is_store_member(s) OR (p_require_admin AND NOT public.is_store_admin(s))) THEN RAISE EXCEPTION 'FINANCIAL_SUMMARY_FORBIDDEN'; END IF;
 IF cardinality(p_store_ids)>25 OR cardinality(p_year_months)>120 OR EXISTS(SELECT 1 FROM unnest(p_year_months) m WHERE m IS NULL OR m !~ '^[0-9]{4}-(0[1-9]|1[0-2])$') THEN RAISE EXCEPTION 'INVALID_FINANCIAL_PERIOD'; END IF;
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
 ), missing_wages AS (
 SELECT DISTINCT q.sid,q.ym FROM requested q JOIN public.employees e
 ON e.store_id=q.sid AND e.is_active AND e.employment_type<>'part_time'
 WHERE greatest(q.first_day,coalesce(e.joined_at,q.first_day))<=least(q.next_month-1,(now() AT TIME ZONE 'Asia/Seoul')::date)
 AND NOT EXISTS(SELECT 1 FROM public.payroll p WHERE p.store_id=q.sid AND p.year_month=q.ym AND p.employee_id=e.id)
 AND NOT EXISTS(SELECT 1 FROM wage_versions w WHERE w.store_id=q.sid AND w.employee_id=e.id AND w.effective_date<=greatest(q.first_day,coalesce(e.joined_at,q.first_day)))
 ), employee_daily AS (
 SELECT q.sid,q.ym,e.id,round(sum(w.base_salary *
 (least(q.next_month,w.until_date,(now() AT TIME ZONE 'Asia/Seoul')::date+1)-greatest(q.first_day,w.effective_date,coalesce(e.joined_at,q.first_day)))
 /(q.next_month-q.first_day))*CASE WHEN e.is_resigned_during_probation THEN 0.8 WHEN e.joined_at IS NOT NULL AND now()<((e.joined_at+61)::timestamp AT TIME ZONE 'UTC') THEN 0.9 ELSE 1 END) gross
 FROM requested q JOIN public.employees e ON e.store_id=q.sid AND e.is_active AND e.employment_type<>'part_time'
 JOIN wage_ranges w ON w.employee_id=e.id AND w.store_id=q.sid
 AND greatest(q.first_day,w.effective_date,coalesce(e.joined_at,q.first_day))<least(q.next_month,w.until_date,(now() AT TIME ZONE 'Asia/Seoul')::date+1)
 WHERE NOT EXISTS(SELECT 1 FROM public.payroll p WHERE p.store_id=q.sid AND p.year_month=q.ym AND p.employee_id=e.id)
 GROUP BY q.sid,q.ym,e.id,e.is_resigned_during_probation,e.joined_at
 ), regular AS (SELECT sid,ym,sum(gross) gross FROM employee_daily GROUP BY sid,ym), recorded AS (
 -- Saved gross is authoritative, including explicit zero, resigned employees and detached records.
 SELECT q.sid,q.ym,sum(CASE
 WHEN q.first_day>(now() AT TIME ZONE 'Asia/Seoul')::date THEN 0
 WHEN q.next_month<=(now() AT TIME ZONE 'Asia/Seoul')::date OR coalesce(e.employment_type,'regular')='part_time' OR p.applied_hourly_wage IS NOT NULL OR p.work_source='legacy_attendance' OR (to_jsonb(p)->'daily_work_snapshot' IS NOT NULL AND to_jsonb(p)->'daily_work_snapshot'<>'null'::jsonb) THEN p.gross
 WHEN p.regular_wage_snapshot IS NOT NULL THEN public.regular_snapshot_gross(p.regular_wage_snapshot,(now() AT TIME ZONE 'Asia/Seoul')::date)
 ELSE round(p.gross * greatest(0,least(q.next_month-1,(now() AT TIME ZONE 'Asia/Seoul')::date)-greatest(q.first_day,coalesce(e.joined_at,q.first_day))+1)::numeric
 /greatest(1,q.next_month-greatest(q.first_day,coalesce(e.joined_at,q.first_day)))) END) gross
 FROM requested q JOIN public.payroll p ON p.store_id=q.sid AND p.year_month=q.ym LEFT JOIN public.employees e ON e.id=p.employee_id AND e.store_id=q.sid GROUP BY q.sid,q.ym
 ), totals AS (
 SELECT q.sid,q.ym,s.r+m.card+m.cash r,p.cost,CASE WHEN mw.sid IS NOT NULL THEN NULL ELSE coalesce(g.gross,0)+coalesce(pt.gross,0) END labor,f.amount fixed,v.amount+round((s.card+m.card)*0.0125) variable
 FROM requested q JOIN sales s USING(sid,ym) JOIN manual m USING(sid,ym) JOIN purchases_agg p USING(sid,ym) JOIN fixed f USING(sid,ym) JOIN variable v USING(sid,ym) LEFT JOIN regular g USING(sid,ym) LEFT JOIN recorded pt USING(sid,ym) LEFT JOIN missing_wages mw USING(sid,ym)
 ) SELECT t.sid,t.ym,t.r,t.cost,t.labor,t.fixed,t.variable,t.r-t.cost-t.labor-t.fixed-t.variable FROM totals t;
END; $$;
REVOKE ALL ON FUNCTION public.get_financial_summaries_v2(uuid[],text[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_financial_summaries_v2(uuid[],text[],boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
