-- QR 자동 인건비를 홈/손익에 연결 / 조정자 확정 2026-11-18.
-- 선행: 20261118140000_attendance_auto_apply.sql 및 기존 recurring financial summary.
-- 월 명세가 있는 직원/월은 저장 명세 우선. 없는 직원/월만 approved 일별 합계. 중복 합산 금지.
-- 원격 미적용. 전체 BEGIN/COMMIT; 실패 ROLLBACK. 복구는 새 보정 파일로 기존 조회 함수 복원.
-- 명세/공제/정규직 월급 산식/POS upsert/반복 고정비를 쓰거나 수정하지 않는다.
BEGIN;
DO $guard$ BEGIN
 IF md5((SELECT prosrc FROM pg_proc WHERE oid='public.get_financial_summaries_v2(uuid[],text[],boolean)'::regprocedure))<>'b694f5beeec770cd9bd51f76bab110c5'
 OR md5((SELECT prosrc FROM pg_proc WHERE oid='public.get_daily_labor_sources(uuid,text)'::regprocedure))<>'54a3251e995de4fdac17ece9674e84d6'
 THEN RAISE EXCEPTION 'LABOR_READ_MODEL_CHANGED_SINCE_REVIEW'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.get_financial_summaries_v2(p_store_ids uuid[], p_year_months text[], p_require_admin boolean DEFAULT false)
 RETURNS TABLE(store_id uuid, year_month text, revenue numeric, purchase_cost numeric, labor_cost numeric, fixed_expense numeric, variable_expense numeric, operating_profit numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
 ), approved_daily AS MATERIALIZED (
 SELECT q.sid,q.ym,d.employee_id,sum(d.gross) gross FROM requested q JOIN public.payroll_daily_work d
  ON d.store_id=q.sid AND d.work_date>=q.first_day AND d.work_date<q.next_month AND d.status='approved'
 WHERE EXISTS(SELECT 1 FROM public.employees e WHERE e.id=d.employee_id AND e.store_id=q.sid AND e.employment_type='part_time')
 AND NOT EXISTS(SELECT 1 FROM public.payroll p WHERE p.store_id=q.sid AND p.employee_id=d.employee_id AND p.year_month=q.ym)
 AND NOT EXISTS(SELECT 1 FROM private.attendance_work_sync x WHERE x.employee_id=d.employee_id AND x.work_date=d.work_date
  AND x.state='completed' AND x.source_snapshot='[]'::jsonb)
 GROUP BY q.sid,q.ym,d.employee_id
 ), daily_totals AS (SELECT sid,ym,sum(gross) gross FROM approved_daily GROUP BY sid,ym
 ), missing_daily AS (
 SELECT DISTINCT q.sid,q.ym FROM requested q JOIN public.employees e ON e.store_id=q.sid AND e.employment_type='part_time'
 WHERE coalesce(e.joined_at,q.first_day)<=least(q.next_month-1,(now() AT TIME ZONE 'Asia/Seoul')::date)
 AND NOT EXISTS(SELECT 1 FROM public.payroll p WHERE p.store_id=q.sid AND p.employee_id=e.id AND p.year_month=q.ym)
 AND (e.is_active OR EXISTS(SELECT 1 FROM public.payroll_daily_work d WHERE d.employee_id=e.id AND d.work_date>=q.first_day AND d.work_date<q.next_month) OR EXISTS(SELECT 1 FROM private.attendance_work_sync x WHERE x.employee_id=e.id AND x.work_date>=q.first_day AND x.work_date<q.next_month))
 AND (NOT EXISTS(SELECT 1 FROM approved_daily d WHERE d.sid=q.sid AND d.ym=q.ym AND d.employee_id=e.id)
 OR EXISTS(SELECT 1 FROM public.payroll_daily_work d WHERE d.employee_id=e.id AND d.work_date>=q.first_day AND d.work_date<q.next_month AND d.status<>'approved'
  AND NOT EXISTS(SELECT 1 FROM private.attendance_work_sync x WHERE x.employee_id=d.employee_id AND x.work_date=d.work_date AND x.state='completed' AND x.source_snapshot='[]'::jsonb))
 OR EXISTS(SELECT 1 FROM private.attendance_work_sync x WHERE x.employee_id=e.id AND x.work_date>=q.first_day AND x.work_date<q.next_month AND x.state='failed'))
 UNION
 -- A retained monthly slip is a historical amount, not proof that later QR work
 -- succeeded. Unresolved automatic sources invalidate totals independently of
 -- payroll existence, employment status and the daily fallback candidates above.
 SELECT q.sid,q.ym FROM requested q
 JOIN private.attendance_work_sync x ON x.store_id=q.sid
  AND x.work_date>=q.first_day AND x.work_date<q.next_month AND x.state<>'completed'
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
 SELECT q.sid,q.ym,
 coalesce((SELECT sum(e.amount) FROM public.expenses e
   WHERE e.store_id=q.sid AND e.category='고정비'
   AND e.year_month=(SELECT max(x.year_month) FROM public.expenses x WHERE x.store_id=q.sid AND x.category='고정비' AND x.year_month<=q.ym)
   AND NOT EXISTS(SELECT 1 FROM public.recurring_fixed_expenses r JOIN public.recurring_fixed_expense_versions v ON v.rule_id=r.id WHERE r.store_id=q.sid AND r.source_expense_id=e.id AND v.effective_month<=q.ym)),0)
 + coalesce((SELECT sum(v.amount) FROM public.recurring_fixed_expenses r
   JOIN LATERAL (SELECT x.* FROM public.recurring_fixed_expense_versions x WHERE x.rule_id=r.id AND x.effective_month<=q.ym ORDER BY x.revision DESC LIMIT 1) v ON true
   WHERE r.store_id=q.sid AND v.active AND (v.end_month IS NULL OR v.end_month>=q.ym)),0) amount
 FROM requested q
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
 SELECT q.sid,q.ym,s.r+m.card+m.cash r,p.cost,CASE WHEN mw.sid IS NOT NULL OR md.sid IS NOT NULL THEN NULL ELSE coalesce(g.gross,0)+coalesce(pt.gross,0)+coalesce(dt.gross,0) END labor,f.amount fixed,v.amount+round((s.card+m.card)*0.0125) variable
 FROM requested q JOIN sales s USING(sid,ym) JOIN manual m USING(sid,ym) JOIN purchases_agg p USING(sid,ym) JOIN fixed f USING(sid,ym) JOIN variable v USING(sid,ym) LEFT JOIN regular g USING(sid,ym) LEFT JOIN recorded pt USING(sid,ym) LEFT JOIN missing_wages mw USING(sid,ym) LEFT JOIN missing_daily md USING(sid,ym) LEFT JOIN daily_totals dt USING(sid,ym)
 ) SELECT t.sid,t.ym,t.r,t.cost,t.labor,t.fixed,t.variable,t.r-t.cost-t.labor-t.fixed-t.variable FROM totals t;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_daily_labor_sources(p_store_id uuid,p_year_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_store_admin(p_store_id),false) THEN
   RAISE EXCEPTION 'DAILY_LABOR_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_year_month IS NULL OR p_year_month !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_LABOR_PERIOD'; END IF;
 RETURN jsonb_build_object(
 'monthlyLaborCost',(SELECT labor_cost FROM public.get_financial_summaries_v2(ARRAY[p_store_id],ARRAY[p_year_month],true)),
 'employees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'store_id',e.store_id,'joined_at',e.joined_at,'is_active',e.is_active,'employment_type',e.employment_type,'is_resigned_during_probation',e.is_resigned_during_probation)),'[]') FROM public.employees e WHERE e.store_id=p_store_id AND (e.joined_at IS NULL OR e.joined_at<(p_year_month||'-01')::date+interval '1 month')),
 'payrolls',(SELECT coalesce(jsonb_agg(q.row),'[]'::jsonb) FROM (
  SELECT jsonb_build_object('id',p.id,'store_id',p.store_id,'employee_id',p.employee_id,'year_month',btrim(p.year_month),
   'gross',p.gross,'regular_wage_snapshot',p.regular_wage_snapshot,'daily_work_snapshot',p.daily_work_snapshot,
   'applied_hourly_wage',p.applied_hourly_wage,'work_source',p.work_source,'source_kind','saved_payroll') row
   FROM public.payroll p WHERE p.store_id=p_store_id AND p.year_month=p_year_month
  UNION ALL
  SELECT jsonb_build_object('id',d.employee_id,'store_id',p_store_id,'employee_id',d.employee_id,'year_month',p_year_month,
   'gross',sum(d.gross),'regular_wage_snapshot',NULL,
   'daily_work_snapshot',jsonb_agg(jsonb_build_object('id',d.id,'revision',d.revision,'work_date',d.work_date,
    'worked_minutes',d.worked_minutes,'applied_hourly_wage',d.applied_hourly_wage,'gross',d.gross,'status',d.status,
    'record_source',d.record_source,'auto_applied_at',d.auto_applied_at) ORDER BY d.work_date),
   'applied_hourly_wage',NULL,'work_source','manual','source_kind','approved_daily_projection') row
   FROM public.payroll_daily_work d WHERE d.store_id=p_store_id AND d.status='approved'
    AND EXISTS(SELECT 1 FROM public.employees e WHERE e.id=d.employee_id AND e.store_id=p_store_id AND e.employment_type='part_time')
    AND d.work_date>=(p_year_month||'-01')::date AND d.work_date<(p_year_month||'-01')::date+interval '1 month'
    AND NOT EXISTS(SELECT 1 FROM public.payroll p WHERE p.store_id=p_store_id AND p.employee_id=d.employee_id AND p.year_month=p_year_month)
    AND NOT EXISTS(SELECT 1 FROM private.attendance_work_sync x WHERE x.employee_id=d.employee_id AND x.work_date=d.work_date AND x.state='completed' AND x.source_snapshot='[]'::jsonb)
   GROUP BY d.employee_id
 ) q),
 'dailyWork',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'store_id',d.store_id,'employee_id',d.employee_id,'work_date',d.work_date,'revision',d.revision,'status',d.status,
  'gross',d.gross,'worked_minutes',d.worked_minutes,'applied_hourly_wage',d.applied_hourly_wage,
  'record_source',d.record_source,'auto_applied_at',d.auto_applied_at) ORDER BY d.work_date,d.employee_id),'[]') FROM public.payroll_daily_work d WHERE NOT EXISTS(SELECT 1 FROM private.attendance_work_sync s WHERE s.employee_id=d.employee_id AND s.work_date=d.work_date AND s.state='completed' AND s.source_snapshot='[]'::jsonb) AND d.store_id=p_store_id AND d.work_date>=(p_year_month||'-01')::date AND d.work_date<(p_year_month||'-01')::date+interval '1 month'),
 -- Failure dates remain visible even when no daily row was created. No truncation:
 -- one month, same administrator authorization as the existing detailed labor RPC.
 'attendanceWorkFailures',(SELECT coalesce(jsonb_agg(jsonb_build_object(
  'store_id',s.store_id,'employee_id',s.employee_id,'work_date',s.work_date,
  'state',s.state,'error_code',s.error_code,'updated_at',s.updated_at)
  ORDER BY s.work_date,s.employee_id),'[]'::jsonb)
  FROM private.attendance_work_sync s WHERE s.store_id=p_store_id AND s.state<>'completed'
   AND s.work_date>=(p_year_month||'-01')::date AND s.work_date<(p_year_month||'-01')::date+interval '1 month'),
 'wages',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',w.id,'store_id',w.store_id,'employee_id',w.employee_id,'effective_date',w.effective_date,'created_at',w.created_at,'base_salary',w.base_salary,'non_taxable',w.non_taxable)),'[]') FROM public.employee_wage_history w WHERE w.store_id=p_store_id AND w.effective_date<(p_year_month||'-01')::date+interval '1 month')
 );
END $$;


NOTIFY pgrst,'reload schema';
COMMIT;
