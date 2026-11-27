-- 목적: 손익·일별 인건비 서버 집계를 급여 계산 2026-v2에 맞춘다.
--   1) get_financial_summaries_v2: 정규직 일할 추정의 수습 계수를 앱(lib/payroll/probation.ts)과 같게 바꾼다.
--      표시한 직원(is_probation)에게만, 수습 시작일(없으면 입사일)~probation_ends_on 날짜에만 90%.
--      오늘 날짜 기준 61일 자동 적용과 수습 중 퇴사 80%는 없앤다.
--   2) get_financial_summaries_v2: 일용근로자 근무 기록(daily_labor_entries) 세전 합계를 인건비에 더하고,
--      사업주 부담 4대보험(예상, 작성한 월 명세·일용 기록 기준)을 영업이익에서 뺀다(사용자 결정 2026-11-27).
--      반환 열은 바꾸지 않는다(operating_profit만 달라짐). 요율 표는 20261127123000에서 만든다(함수 실행 시점에 필요).
--   3) get_daily_labor_sources: 직원 수습 필드와 일용근로자 일별 세전(dailyLaborEntries)을 함께 돌려준다.
-- 저장된 월 명세(payroll)·스냅샷 금액은 그대로 우선한다. 공제·명세를 쓰거나 고치지 않는다.
-- 앱 동등성: lib/services/dailyLaborSeries.ts(일별)와 lib/services/profitLoss.ts(월)를 같은 기준으로 함께 바꿨다.
-- 정책 문서: docs/intent/급여-계산-바로잡기.md.
-- 선행 파일: 20261118150000_daily_work_labor_read_models.sql(두 함수 원본, 아래 md5 가드),
--   20261127120000_payroll_v2_employee_fields.sql(probation_ends_on), 20261127121000_daily_laborers.sql.
-- 시그니처·반환 형태·SECURITY DEFINER·search_path·권한은 원본과 같다(CREATE OR REPLACE는 GRANT를 유지한다).
-- 재실행: 가드는 원본 본문일 때만 통과한다. 이미 적용했다면 다시 실행하지 않는다(LABOR_READ_MODEL_CHANGED_SINCE_REVIEW).
-- 복구: 20261118150000의 두 함수 정의를 새 보정 파일로 다시 적용한다.
BEGIN;
DO $guard$ BEGIN
 IF md5((SELECT prosrc FROM pg_proc WHERE oid='public.get_financial_summaries_v2(uuid[],text[],boolean)'::regprocedure))<>'5f9e8e1df759ec365976c32add676f89'
 OR md5((SELECT prosrc FROM pg_proc WHERE oid='public.get_daily_labor_sources(uuid,text)'::regprocedure))<>'379fa1a683afd124b7a5e5de954085e2'
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
 -- 2026-v2: 수습은 표시한 직원(is_probation)에게만, 날짜별로 90%. 수습일 수만큼 10%를 뺀다(수습 중 퇴사 80% 제거).
 SELECT q.sid,q.ym,e.id,round(sum(w.base_salary *
 ((least(q.next_month,w.until_date,(now() AT TIME ZONE 'Asia/Seoul')::date+1)-greatest(q.first_day,w.effective_date,coalesce(e.joined_at,q.first_day)))
  -0.1*CASE WHEN e.is_probation AND e.probation_ends_on IS NOT NULL AND coalesce(e.probation_started_at,e.joined_at) IS NOT NULL THEN greatest(0,
   least(q.next_month,w.until_date,(now() AT TIME ZONE 'Asia/Seoul')::date+1,e.probation_ends_on+1)
   -greatest(q.first_day,w.effective_date,coalesce(e.joined_at,q.first_day),coalesce(e.probation_started_at,e.joined_at))) ELSE 0 END)
 /(q.next_month-q.first_day))) gross
 FROM requested q JOIN public.employees e ON e.store_id=q.sid AND e.is_active AND e.employment_type<>'part_time'
 JOIN wage_ranges w ON w.employee_id=e.id AND w.store_id=q.sid
 AND greatest(q.first_day,w.effective_date,coalesce(e.joined_at,q.first_day))<least(q.next_month,w.until_date,(now() AT TIME ZONE 'Asia/Seoul')::date+1)
 WHERE NOT EXISTS(SELECT 1 FROM public.payroll p WHERE p.store_id=q.sid AND p.year_month=q.ym AND p.employee_id=e.id)
 GROUP BY q.sid,q.ym,e.id
 ), regular AS (SELECT sid,ym,sum(gross) gross FROM employee_daily GROUP BY sid,ym), recorded AS (
 -- Saved gross is authoritative, including explicit zero, resigned employees and detached records.
 SELECT q.sid,q.ym,sum(CASE
 WHEN q.first_day>(now() AT TIME ZONE 'Asia/Seoul')::date THEN 0
 WHEN q.next_month<=(now() AT TIME ZONE 'Asia/Seoul')::date OR coalesce(e.employment_type,'regular')='part_time' OR p.applied_hourly_wage IS NOT NULL OR p.work_source='legacy_attendance' OR (to_jsonb(p)->'daily_work_snapshot' IS NOT NULL AND to_jsonb(p)->'daily_work_snapshot'<>'null'::jsonb) THEN p.gross
 WHEN p.regular_wage_snapshot IS NOT NULL THEN public.regular_snapshot_gross(p.regular_wage_snapshot,(now() AT TIME ZONE 'Asia/Seoul')::date)
 ELSE round(p.gross * greatest(0,least(q.next_month-1,(now() AT TIME ZONE 'Asia/Seoul')::date)-greatest(q.first_day,coalesce(e.joined_at,q.first_day))+1)::numeric
 /greatest(1,q.next_month-greatest(q.first_day,coalesce(e.joined_at,q.first_day)))) END) gross
 FROM requested q JOIN public.payroll p ON p.store_id=q.sid AND p.year_month=q.ym LEFT JOIN public.employees e ON e.id=p.employee_id AND e.store_id=q.sid GROUP BY q.sid,q.ym
 ), daily_laborer_totals AS (
 -- 일용근로자(계정 없음) 하루 근무 기록의 세전 합계. 근무일이 속한 달 인건비에 넣는다.
 SELECT q.sid,q.ym,sum(l.gross) gross FROM requested q JOIN public.daily_labor_entries l
  ON l.store_id=q.sid AND l.work_date>=q.first_day AND l.work_date<q.next_month GROUP BY q.sid,q.ym
 ), employer_rates AS (
 -- 사업주 부담 요율: 고용안정(150인 미만)과 매장 업종 산재(업종 미선택·요율 없음 = 산재 미포함).
 SELECT q.sid,q.ym,
  (SELECT r.employment_stability_under_150 FROM public.employer_insurance_rates r WHERE r.effective_from<=q.first_day AND r.effective_to>=q.first_day ORDER BY r.effective_from DESC LIMIT 1) stability,
  (SELECT a.rate+a.commute_rate+a.wage_claim_rate+coalesce(a.asbestos_rate,0) FROM public.stores st JOIN public.industrial_accident_rates a ON a.industry_code=st.industrial_accident_industry
   WHERE st.id=q.sid AND a.effective_from<=q.first_day AND a.effective_to>=q.first_day ORDER BY a.effective_from DESC LIMIT 1) accident
 FROM requested q
 ), employer_rows AS (
 -- 앱 lib/payroll/employerEstimate.ts와 같은 식: 작성한 월 명세(3.3% 제외)와 일용 근무 기록.
 -- 보험료 = 10원 미만 버림(요율은 백만분율 정수로 곱한다). 국민연금·건강·장기요양·실업급여는 근로자분과 같다.
 SELECT q.sid,q.ym,coalesce(p.national_pension,0)+coalesce(p.health_insurance,0)+coalesce(p.long_term_care,0)+coalesce(p.employment_insurance,0) share,
  CASE WHEN coalesce(p.employment_insurance,0)>0 THEN round(coalesce(p.taxable_base,0)) ELSE NULL END stability_base,
  round(CASE WHEN coalesce(p.taxable_base,0)>0 THEN p.taxable_base ELSE p.gross END) accident_base
 FROM requested q JOIN public.payroll p ON p.store_id=q.sid AND p.year_month=q.ym
 WHERE coalesce(p.withholding_tax,0)=0 AND q.first_day<=(now() AT TIME ZONE 'Asia/Seoul')::date
 UNION ALL
 SELECT q.sid,q.ym,l.employment_insurance,CASE WHEN l.employment_insurance>0 THEN l.gross ELSE NULL END,l.gross
 FROM requested q JOIN public.daily_labor_entries l ON l.store_id=q.sid AND l.work_date>=q.first_day AND l.work_date<q.next_month
 WHERE q.first_day<=(now() AT TIME ZONE 'Asia/Seoul')::date
 ), employer AS (
 SELECT er.sid,er.ym,CASE
  WHEN er.stability IS NULL AND EXISTS(SELECT 1 FROM employer_rows x WHERE x.sid=er.sid AND x.ym=er.ym) THEN NULL
  ELSE coalesce((SELECT sum(x.share
   +coalesce(floor(x.stability_base*round(er.stability*1000000)/10000000)*10,0)
   +CASE WHEN er.accident IS NULL THEN 0 ELSE floor(x.accident_base*round(er.accident*1000000)/10000000)*10 END)
   FROM employer_rows x WHERE x.sid=er.sid AND x.ym=er.ym),0) END amount
 FROM employer_rates er
 ), totals AS (
 SELECT q.sid,q.ym,s.r+m.card+m.cash r,p.cost,CASE WHEN mw.sid IS NOT NULL OR md.sid IS NOT NULL THEN NULL ELSE coalesce(g.gross,0)+coalesce(pt.gross,0)+coalesce(dt.gross,0)+coalesce(dl.gross,0) END labor,f.amount fixed,v.amount+round((s.card+m.card)*0.0125) variable,ep.amount employer
 FROM requested q JOIN sales s USING(sid,ym) JOIN manual m USING(sid,ym) JOIN purchases_agg p USING(sid,ym) JOIN fixed f USING(sid,ym) JOIN variable v USING(sid,ym) LEFT JOIN regular g USING(sid,ym) LEFT JOIN recorded pt USING(sid,ym) LEFT JOIN missing_wages mw USING(sid,ym) LEFT JOIN missing_daily md USING(sid,ym) LEFT JOIN daily_totals dt USING(sid,ym) LEFT JOIN daily_laborer_totals dl USING(sid,ym) JOIN employer ep USING(sid,ym)
 ) -- 2026-v2: 영업이익에서 사업주 부담 4대보험(예상)도 뺀다. 부담 요율을 확인하지 못한 달은 영업이익을 비운다(null).
 SELECT t.sid,t.ym,t.r,t.cost,t.labor,t.fixed,t.variable,t.r-t.cost-t.labor-t.fixed-t.variable-t.employer FROM totals t;
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
 'employees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'store_id',e.store_id,'joined_at',e.joined_at,'is_active',e.is_active,'employment_type',e.employment_type,'is_resigned_during_probation',e.is_resigned_during_probation,'is_probation',e.is_probation,'probation_started_at',e.probation_started_at,'probation_ends_on',e.probation_ends_on)),'[]') FROM public.employees e WHERE e.store_id=p_store_id AND (e.joined_at IS NULL OR e.joined_at<(p_year_month||'-01')::date+interval '1 month')),
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
 'dailyLaborEntries',(SELECT coalesce(jsonb_agg(jsonb_build_object('store_id',l.store_id,'work_date',l.work_date,'gross',l.gross) ORDER BY l.work_date,l.id),'[]'::jsonb)
  FROM public.daily_labor_entries l WHERE l.store_id=p_store_id AND l.work_date>=(p_year_month||'-01')::date AND l.work_date<(p_year_month||'-01')::date+interval '1 month'),
 'wages',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',w.id,'store_id',w.store_id,'employee_id',w.employee_id,'effective_date',w.effective_date,'created_at',w.created_at,'base_salary',w.base_salary,'non_taxable',w.non_taxable)),'[]') FROM public.employee_wage_history w WHERE w.store_id=p_store_id AND w.effective_date<(p_year_month||'-01')::date+interval '1 month')
 );
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
