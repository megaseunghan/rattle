BEGIN;
-- 승인된 매장 구성원에게 합계만 반환. 개인 급여·급여 이력 RLS는 그대로 유지한다.
CREATE FUNCTION public.get_home_financial_summary(p_store_id uuid, p_year_month text)
RETURNS TABLE(year_month text, revenue numeric, purchase_cost numeric, labor_cost numeric,
  fixed_expense numeric, variable_expense numeric, operating_profit numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  first_day date;
  next_month date;
  day_count integer;
  today_kst date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  close_at time;
  from_at timestamptz;
  to_at timestamptz;
  r numeric := 0;
  card numeric := 0;
  manual_card numeric := 0;
  manual_cash numeric := 0;
  purchases_total numeric := 0;
  fixed_total numeric := 0;
  variable_total numeric := 0;
  regular_total numeric := 0;
  part_total numeric := 0;
  fixed_month text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_store_member(p_store_id) THEN RAISE EXCEPTION 'HOME_SUMMARY_FORBIDDEN'; END IF;
  IF p_year_month IS NULL OR p_year_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION '대상 월을 확인해주세요'; END IF;
  first_day := (p_year_month || '-01')::date;
  next_month := (first_day + interval '1 month')::date;
  day_count := next_month - first_day;
  SELECT coalesce(s.closing_time, '23:00'::time) INTO close_at FROM public.stores s WHERE s.id = p_store_id;
  from_at := (first_day + close_at) AT TIME ZONE 'Asia/Seoul';
  to_at := least((next_month + close_at) AT TIME ZONE 'Asia/Seoul', now());
  SELECT coalesce(sum(CASE WHEN coalesce(t.card_amount,0)+coalesce(t.cash_amount,0)>0
      THEN coalesce(t.card_amount,0)+coalesce(t.cash_amount,0) ELSE coalesce(t.total_amount,0) END),0),
    coalesce(sum(coalesce(t.card_amount,0)),0)
    INTO r, card FROM public.toss_orders t WHERE t.store_id=p_store_id AND t.status='COMPLETED' AND t.order_at>=from_at AND t.order_at<=to_at;
  SELECT coalesce(sum(m.card_amount),0),coalesce(sum(m.cash_amount),0) INTO manual_card,manual_cash
    FROM public.manual_sales m WHERE m.store_id=p_store_id AND m.date>=first_day AND m.date<next_month;
  r := r + manual_card + manual_cash;
  card := card + manual_card;
  SELECT coalesce(sum(p.amount),0) INTO purchases_total FROM public.purchases p
    WHERE p.store_id=p_store_id AND p.date>=first_day AND p.date<next_month;
  SELECT max(e.year_month) INTO fixed_month FROM public.expenses e
    WHERE e.store_id=p_store_id AND e.category='고정비' AND e.year_month<=p_year_month;
  SELECT coalesce(sum(e.amount),0) INTO fixed_total FROM public.expenses e
    WHERE e.store_id=p_store_id AND e.category='고정비' AND e.year_month=fixed_month;
  SELECT coalesce(sum(e.amount),0) INTO variable_total FROM public.expenses e
    WHERE e.store_id=p_store_id AND e.year_month=p_year_month AND e.category IN ('마케팅','시설보수','공과금');
  variable_total := variable_total + round(card * 0.0125);

  -- 기존 손익과 같은 계산: 재직 정규직 급여 이력을 날짜별로 적용하고 직원별 반올림.
  -- 수습 판단은 기존 앱의 joined_at UTC 자정 + 61일 기준을 따른다.
  SELECT coalesce(sum(x.gross),0) INTO regular_total FROM (
    SELECT e.id, round(coalesce(sum(w.base_salary / day_count),0) * CASE
      WHEN e.is_resigned_during_probation THEN 0.8
      WHEN e.joined_at IS NOT NULL AND now() < ((e.joined_at + 61)::timestamp AT TIME ZONE 'UTC') THEN 0.9
      ELSE 1 END) AS gross
    FROM public.employees e
    CROSS JOIN generate_series(first_day::timestamp,least(next_month-1,today_kst)::timestamp,interval '1 day') d(day)
    LEFT JOIN LATERAL (
      SELECT h.base_salary FROM public.employee_wage_history h
      WHERE h.store_id=p_store_id AND h.employee_id=e.id AND h.effective_date<=d.day::date
      ORDER BY h.effective_date DESC,h.created_at DESC,h.id DESC LIMIT 1
    ) w ON true
    WHERE e.store_id=p_store_id AND e.is_active AND e.employment_type<>'part_time'
    GROUP BY e.id,e.is_resigned_during_probation,e.joined_at
  ) x;
  -- 퇴사한 파트타이머도 저장된 급여 금액으로 합산한다.
  SELECT coalesce(sum(p.gross),0) INTO part_total FROM public.payroll p
    LEFT JOIN public.employees e ON e.id=p.employee_id AND e.store_id=p.store_id
    WHERE p.store_id=p_store_id AND p.year_month=p_year_month AND (
      e.employment_type='part_time' OR p.applied_hourly_wage IS NOT NULL OR p.work_source='legacy_attendance');
  RETURN QUERY SELECT p_year_month,r,purchases_total,regular_total+part_total,fixed_total,variable_total,
    r-purchases_total-regular_total-part_total-fixed_total-variable_total;
END;
$$;
REVOKE ALL ON FUNCTION public.get_home_financial_summary(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_home_financial_summary(uuid,text) TO authenticated;
COMMIT;
