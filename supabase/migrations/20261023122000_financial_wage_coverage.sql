-- Read-only financial aggregation. No payroll or wage history rows are inserted or updated.
-- Deploy after 20261023120000_read_models_and_integrity.sql. Existing v1 callers remain compatible.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_financial_summaries_v2(p_store_ids uuid[],p_year_months text[],p_require_admin boolean DEFAULT false)
RETURNS TABLE(store_id uuid,year_month text,revenue numeric,purchase_cost numeric,labor_cost numeric,fixed_expense numeric,variable_expense numeric,operating_profit numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
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
 SELECT q.sid,q.ym,sum(p.gross) gross FROM requested q JOIN public.payroll p ON p.store_id=q.sid AND p.year_month=q.ym GROUP BY q.sid,q.ym
 ), totals AS (
 SELECT q.sid,q.ym,s.r+m.card+m.cash r,p.cost,CASE WHEN mw.sid IS NOT NULL THEN NULL ELSE coalesce(g.gross,0)+coalesce(pt.gross,0) END labor,f.amount fixed,v.amount+round((s.card+m.card)*0.0125) variable
 FROM requested q JOIN sales s USING(sid,ym) JOIN manual m USING(sid,ym) JOIN purchases_agg p USING(sid,ym) JOIN fixed f USING(sid,ym) JOIN variable v USING(sid,ym) LEFT JOIN regular g USING(sid,ym) LEFT JOIN recorded pt USING(sid,ym) LEFT JOIN missing_wages mw USING(sid,ym)
 ) SELECT t.sid,t.ym,t.r,t.cost,t.labor,t.fixed,t.variable,t.r-t.cost-t.labor-t.fixed-t.variable FROM totals t;
END; $$;
REVOKE ALL ON FUNCTION public.get_financial_summaries_v2(uuid[],text[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_financial_summaries_v2(uuid[],text[],boolean) TO authenticated;

COMMIT;
