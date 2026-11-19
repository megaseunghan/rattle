-- 홈 일별 차트의 원본 매출·매입을 영업일별 합계로 돌려준다.
-- 기존에는 주문(toss_orders)·수기 매출·매입 원본 행을 500건씩 페이지로 모두 받아 앱에서 날짜별로 더했다.
--
-- 판정 기준은 앱과 같다: 영업일 범위(p_from~p_to)와 날짜 범위(p_start~p_end)는 앱이 계산해 넘기고,
-- 주문의 영업일 = UTC 시각 + 9시간 - 마감 시각(분). 주문 매출 = 카드+현금이 0보다 크면 그 합, 아니면 total_amount.
-- 원본 행이 하나라도 있는 날짜만 돌려준다(금액이 0이어도 기록이 있는 날로 남는다).
-- SECURITY INVOKER: 세 테이블 RLS를 호출자 권한 그대로 적용한다. 재무 접근 확인은 기존처럼 앱이 먼저 수행한다.
CREATE OR REPLACE FUNCTION public.get_home_daily_sources(
  p_store_id uuid, p_start date, p_end date, p_from timestamptz, p_to timestamptz, p_closing_minutes integer)
RETURNS TABLE(date date, revenue numeric, card_revenue numeric, purchase numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH src AS (
    SELECT ((o.order_at AT TIME ZONE 'UTC') + interval '9 hours' - make_interval(mins => p_closing_minutes))::date AS d,
           CASE WHEN o.card_amount + o.cash_amount > 0 THEN o.card_amount + o.cash_amount ELSE o.total_amount END AS revenue,
           o.card_amount AS card,
           0::numeric AS purchase
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
  SELECT d, sum(revenue), sum(card), sum(purchase)
  FROM src
  GROUP BY d
  ORDER BY d
$$;

REVOKE ALL ON FUNCTION public.get_home_daily_sources(uuid, date, date, timestamptz, timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_home_daily_sources(uuid, date, date, timestamptz, timestamptz, integer) TO authenticated;
