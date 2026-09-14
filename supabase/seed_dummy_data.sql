-- 테스트용 더미 데이터 — SQL Editor에서 필요할 때만 수동 실행 (마이그레이션 아님, 자동 실행 안 됨)
-- 기본적으로 로그인한 관리자 계정의 첫 번째 매장을 대상으로 한다.
-- 다른 매장을 쓰려면 v_store_id 서브쿼리를 원하는 매장 이름으로 바꿔서 실행.

DO $$
DECLARE
  v_store_id UUID;
  v_emp_regular UUID;
  v_emp_part UUID;
  v_ing_1 UUID;
  v_ing_2 UUID;
  v_ing_3 UUID;
  v_recipe_id UUID;
  v_today DATE := CURRENT_DATE;
  v_ym TEXT := to_char(CURRENT_DATE, 'YYYY-MM');
BEGIN
  SELECT id INTO v_store_id FROM stores ORDER BY created_at LIMIT 1;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION '매장이 없습니다. 먼저 앱에서 매장을 만들어주세요.';
  END IF;

  -- 직원 2명 (정규직 + 파트타이머)
  INSERT INTO employees (store_id, name, employment_type, base_salary, hourly_wage, non_taxable, joined_at, phone, dependents, weekly_hours, is_active)
  VALUES (v_store_id, '더미직원', 'regular', 3000000, NULL, 200000, v_today - INTERVAL '300 days', '010-1111-2222', 1, 40, true)
  RETURNING id INTO v_emp_regular;

  INSERT INTO employees (store_id, name, employment_type, base_salary, hourly_wage, non_taxable, joined_at, phone, dependents, weekly_hours, is_active)
  VALUES (v_store_id, '더미파트', 'part_time', 0, 10500, 0, v_today - INTERVAL '60 days', '010-3333-4444', 0, 20, true)
  RETURNING id INTO v_emp_part;

  -- 이번 주 스케줄 (월~금 09-18, 파트는 화/목 10-15)
  INSERT INTO employee_schedules (store_id, employee_id, day_of_week, is_working, start_time, end_time)
  SELECT v_store_id, v_emp_regular, d, true, '09:00', '18:00' FROM generate_series(1, 5) d;
  INSERT INTO employee_schedules (store_id, employee_id, day_of_week, is_working, start_time, end_time)
  VALUES (v_store_id, v_emp_part, 2, true, '10:00', '15:00'), (v_store_id, v_emp_part, 4, true, '10:00', '15:00');

  -- 오늘 출근 기록 (정규직만 출근, 파트는 미출근 상태로 남겨서 대시보드 테스트용)
  INSERT INTO attendance (store_id, employee_id, type, timestamp, latitude, longitude, distance_m)
  VALUES (v_store_id, v_emp_regular, 'clock_in', v_today + TIME '09:07', 37.5665, 126.9780, 5);

  -- 식자재 3종
  INSERT INTO ingredients (store_id, name, category, current_stock, unit, min_stock, last_price)
  VALUES (v_store_id, '더미 원두', '식자재', 5, 'kg', 10, 25000) RETURNING id INTO v_ing_1;
  INSERT INTO ingredients (store_id, name, category, current_stock, unit, min_stock, last_price)
  VALUES (v_store_id, '더미 우유', '식자재', 20, 'L', 5, 3000) RETURNING id INTO v_ing_2;
  INSERT INTO ingredients (store_id, name, category, current_stock, unit, min_stock, last_price)
  VALUES (v_store_id, '더미 컵', '비품', 3, 'box', 5, 15000) RETURNING id INTO v_ing_3;

  -- 레시피 1개
  INSERT INTO recipes (store_id, name, category, selling_price, cost, margin_rate)
  VALUES (v_store_id, '더미 아메리카노', '음료', 4500, 1200, 73.3) RETURNING id INTO v_recipe_id;
  INSERT INTO recipe_ingredients (recipe_id, ingredient_id, quantity, unit)
  VALUES (v_recipe_id, v_ing_1, 20, 'g');

  -- 이번 달 매입 2건
  INSERT INTO purchases (store_id, date, supplier, amount, category, type)
  VALUES (v_store_id, v_today, '더미 식자재상', 250000, '식자재', '수기');
  INSERT INTO purchases (store_id, date, supplier, amount, category, type)
  VALUES (v_store_id, v_today, '더미 비품상', 80000, '비품', '수기');

  -- 이번 달 비용 (고정비 포함)
  INSERT INTO expenses (store_id, year_month, category, name, amount)
  VALUES (v_store_id, v_ym, '고정비', '임대료', 1500000), (v_store_id, v_ym, '마케팅', '인스타 광고', 100000);

  -- 오늘 수기 매출
  INSERT INTO manual_sales (store_id, date, cash_amount, card_amount, discount_amount, memo)
  VALUES (v_store_id, v_today, 120000, 380000, 5000, '더미 데이터')
  ON CONFLICT (store_id, date) DO NOTHING;

  -- 청소 체크리스트 (오픈 2개, 마감 1개) + 오늘 체크 로그 1개
  INSERT INTO cleaning_items (store_id, segment, title, sort_order)
  VALUES (v_store_id, 'open', '바닥 청소', 0), (v_store_id, 'open', '테이블 세팅', 1), (v_store_id, 'close', '커피머신 세척', 0);

  RAISE NOTICE '더미 데이터 생성 완료 — store_id: %, regular_employee: %, part_time_employee: %', v_store_id, v_emp_regular, v_emp_part;
END $$;
