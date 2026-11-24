-- 목적: 홈 일별 매출·매입 합계(get_home_daily_sources)를 관리자(소유자·매니저)만 받게 한다.
--   기존 함수는 SECURITY INVOKER + 테이블 RLS(매장 멤버 기준)만 적용돼, 앱이 먼저 부르던
--   assert_store_finance_access를 생략하거나 동시에 보내면 일반 직원·파트타이머도 일별 합계를 받을 수 있었다.
--   다른 일별 RPC(get_daily_labor_sources·get_daily_expense_series)처럼 함수 안에서 직접 거절한다.
-- 판정 기준: assert_store_finance_access와 같은 public.is_store_admin(p_store_id). 비로그인(auth.uid() NULL)도 거절.
-- 거절 오류: 'HOME_DAILY_SOURCES_FORBIDDEN' (ERRCODE 42501).
-- 정책 문서: docs/intent/앱-속도-개선-요청순서.md (⑤단계 Q14 (a)), AGENTS.md DB·서버 절.
-- 선행 파일: 20261118141000_home_daily_sources.sql(함수 원본), 20261117150000_role_model_core.sql(is_store_admin).
-- 변경 범위: 시그니처·반환 형태·SECURITY INVOKER·search_path·GRANT는 그대로. 집계 식은 원본과 동일하다.
--   LANGUAGE sql → plpgsql(RETURN QUERY)로만 바꾼다. 테이블·자료는 바꾸지 않는다.
-- 재실행: CREATE OR REPLACE + REVOKE/GRANT라 여러 번 적용해도 같은 결과다.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_home_daily_sources(
  p_store_id uuid, p_start date, p_end date, p_from timestamptz, p_to timestamptz, p_closing_minutes integer)
RETURNS TABLE(date date, revenue numeric, card_revenue numeric, purchase numeric)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.is_store_admin(p_store_id), false) THEN
    RAISE EXCEPTION 'HOME_DAILY_SOURCES_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH src AS (
    SELECT ((o.order_at AT TIME ZONE 'UTC') + interval '9 hours' - make_interval(mins => p_closing_minutes))::date AS d,
           CASE WHEN o.card_amount + o.cash_amount > 0 THEN o.card_amount + o.cash_amount ELSE o.total_amount END AS rev,
           o.card_amount AS card,
           0::numeric AS pur
    FROM public.toss_orders o
    WHERE o.store_id = p_store_id AND o.status = 'COMPLETED'
      AND p_from < p_to AND o.order_at >= p_from AND o.order_at < p_to
    UNION ALL
    SELECT m.date, m.card_amount + m.cash_amount, m.card_amount, 0
    FROM public.manual_sales m
    WHERE m.store_id = p_store_id AND m.date BETWEEN p_start AND p_end
    UNION ALL
    SELECT pu.date, 0, 0, pu.amount
    FROM public.purchases pu
    WHERE pu.store_id = p_store_id AND pu.date BETWEEN p_start AND p_end
  )
  SELECT src.d, sum(src.rev)::numeric, sum(src.card)::numeric, sum(src.pur)::numeric
  FROM src
  GROUP BY src.d
  ORDER BY src.d;
END $$;

REVOKE ALL ON FUNCTION public.get_home_daily_sources(uuid, date, date, timestamptz, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_home_daily_sources(uuid, date, date, timestamptz, timestamptz, integer) TO authenticated;

COMMIT;
