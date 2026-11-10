-- Read-only admin source contract. Apply after 20261027010000 and 20261027011000.
-- No payroll, settlement, wage history or daily-work data is rewritten.
BEGIN;
CREATE FUNCTION public.get_daily_labor_sources(p_store_id uuid,p_year_month text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT coalesce(public.is_store_admin(p_store_id),false) THEN
   RAISE EXCEPTION 'DAILY_LABOR_FORBIDDEN' USING ERRCODE='42501';
 END IF;
 IF p_year_month IS NULL OR p_year_month !~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_LABOR_PERIOD'; END IF;
 RETURN jsonb_build_object(
 'monthlyLaborCost',(SELECT labor_cost FROM public.get_financial_summaries_v2(ARRAY[p_store_id],ARRAY[p_year_month],true)),
 'employees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'store_id',e.store_id,'joined_at',e.joined_at,'is_active',e.is_active,'employment_type',e.employment_type,'is_resigned_during_probation',e.is_resigned_during_probation)),'[]') FROM public.employees e WHERE e.store_id=p_store_id AND (e.joined_at IS NULL OR e.joined_at<(p_year_month||'-01')::date+interval '1 month')),
 'payrolls',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'store_id',p.store_id,'employee_id',p.employee_id,'year_month',btrim(p.year_month),'gross',p.gross,'regular_wage_snapshot',p.regular_wage_snapshot,'daily_work_snapshot',p.daily_work_snapshot,'applied_hourly_wage',p.applied_hourly_wage,'work_source',p.work_source)),'[]') FROM public.payroll p WHERE p.store_id=p_store_id AND p.year_month=p_year_month),
 'dailyWork',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'store_id',d.store_id,'employee_id',d.employee_id,'work_date',d.work_date,'revision',d.revision,'status',d.status)),'[]') FROM public.payroll_daily_work d WHERE d.store_id=p_store_id AND d.work_date>=(p_year_month||'-01')::date AND d.work_date<(p_year_month||'-01')::date+interval '1 month'),
 'wages',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',w.id,'store_id',w.store_id,'employee_id',w.employee_id,'effective_date',w.effective_date,'created_at',w.created_at,'base_salary',w.base_salary,'non_taxable',w.non_taxable)),'[]') FROM public.employee_wage_history w WHERE w.store_id=p_store_id AND w.effective_date<(p_year_month||'-01')::date+interval '1 month')
 );
END $$;
REVOKE ALL ON FUNCTION public.get_daily_labor_sources(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_daily_labor_sources(uuid,text) TO authenticated;
COMMIT;
