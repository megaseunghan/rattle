-- 래틀 스크린샷 전용 가상 매장. Supabase SQL Editor에서 전체 실행.
-- owner_email에 기존 앱 계정 이메일을 입력하거나, owner_store_name에 본인 소유 기존 매장 이름을 입력하세요.
-- owner_store_name이 있으면 그 매장의 소유자 계정으로 생성합니다. 새 Auth 계정을 만들지는 않습니다.
-- 기존 매장은 소유자 조회에만 사용하며 수정/삭제하지 않습니다. 같은 데모 재실행은 오류로 중단합니다.
-- 금액은 화면 시연용 가상 수치이며 실제 급여 정산/세무 근거가 아닙니다.
BEGIN;
CREATE TEMP TABLE rattle_demo_suppliers(ingredient_id uuid PRIMARY KEY,supplier_name text) ON COMMIT DROP;
DO $demo$
DECLARE
  owner_email text := NULL; -- 기존 앱 계정 이메일을 입력하세요.
  owner_store_name text := NULL; -- 이메일 대신 본인 소유 매장 이름을 입력할 수 있습니다.
  owner_matches integer;
  owner_uid uuid;
  sid uuid := '7a771e00-1026-4000-8000-000000000001';
  marker uuid := '7a771e00-1026-4000-8000-000000000002';
  today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  first_month date := (date_trunc('month',now() AT TIME ZONE 'Asia/Seoul')-interval '2 months')::date;
  d date; m date; ym text; r record; e record; item record;
  eid uuid; iid uuid; rid uuid; pid uuid; oid uuid;
  revenue numeric; monthly_revenue numeric; total numeric; gross numeric; deduction numeric;
  minutes integer; days integer; seq integer := 0;
BEGIN
  IF nullif(btrim(owner_store_name),'') IS NOT NULL THEN
    SELECT count(*), (array_agg(s.owner_id))[1] INTO owner_matches,owner_uid
    FROM public.stores s JOIN auth.users u ON u.id=s.owner_id WHERE s.name=btrim(owner_store_name);
    IF owner_matches=0 THEN RAISE EXCEPTION '해당 이름의 기존 매장을 찾지 못했습니다. owner_store_name을 확인하세요.'; END IF;
    IF owner_matches>1 THEN RAISE EXCEPTION '같은 이름의 매장이 여러 개입니다. owner_store_name을 NULL로 두고 owner_email로 계정을 지정하세요.'; END IF;
  ELSE
    SELECT count(*), (array_agg(u.id))[1] INTO owner_matches,owner_uid
    FROM auth.users u WHERE lower(u.email)=lower(btrim(owner_email));
    IF owner_matches=0 THEN RAISE EXCEPTION '해당 이메일로 가입된 앱 계정이 없습니다. 기존 로그인 이메일을 입력하거나 owner_store_name에 본인 소유 매장 이름을 입력하세요. 새 계정은 생성하지 않습니다.'; END IF;
    IF owner_matches>1 THEN RAISE EXCEPTION '해당 이메일의 계정이 여러 개입니다. owner_store_name으로 소유 매장을 지정하세요.'; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM public.stores WHERE id=sid OR setup_request_id=marker) THEN
    RAISE EXCEPTION '래틀 데모가 이미 있습니다. 중복 생성하지 않습니다. 기존 래틀 매장을 선택하세요.';
  END IF;
  -- 트리거의 작성자/관리자 검사를 위한 트랜잭션 내부 인증 문맥.
  PERFORM set_config('request.jwt.claim.sub',owner_uid::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',owner_uid,'role','authenticated')::text,true);
  INSERT INTO public.stores(id,owner_id,name,categories,purchase_categories,purchase_types,closing_time,
    labor_ratio_target,cogs_ratio_target,financial_share_scope,pos_setup_choice,setup_request_id)
  VALUES(sid,owner_uid,'래틀','["식자재","주류","비품"]',ARRAY['식자재','주류','비품'],ARRAY['수기'],
    '00:00',30,38,'all_staff','later',marker);
  -- 소유자 권한으로 사용. 직원 Auth 계정·실제 연락처·은행계좌는 생성하지 않는다.
  INSERT INTO public.store_home_workflows(store_id,configuration) VALUES(sid,
    '{"open":["open_check","stock","schedule"],"business":["stock_edit","purchase","recipes","weekday_check"],"close":["close_check","sales","expenses"]}');

  -- 브런치 & 다이닝 매장. 단위는 재고·매입·레시피에서 동일하게 사용한다.
  FOR r IN SELECT * FROM (VALUES
    ('한우 채끝','식자재','g',12800,3000,52,'바른축산'),
    ('닭다리살','식자재','g',18000,4000,12,'바른축산'),
    ('파스타면','식자재','g',24000,5000,4,'오늘식자재'),
    ('생크림','식자재','ml',12000,3000,7,'오늘식자재'),
    ('토마토소스','식자재','g',16000,4000,5,'오늘식자재'),
    ('샐러드 채소','식자재','g',8400,2500,9,'초록농장'),
    ('아보카도','식자재','개',42,12,1800,'초록농장'),
    ('블렌드 원두','식자재','g',9200,2000,28,'모닝로스터스'),
    ('우유','식자재','ml',18000,4000,3,'오늘식자재'),
    ('레몬','식자재','개',54,15,800,'초록농장'),
    ('하우스 와인','주류','ml',18000,4500,18,'소담주류'),
    ('크래프트 맥주','주류','병',96,24,2800,'소담주류'),
    ('테이크아웃 컵','비품','개',850,200,120,'래틀패키지'),
    ('포장 용기','비품','개',320,100,350,'래틀패키지')
  ) v(name,category,unit,stock,minimum,price,supplier) LOOP
    INSERT INTO public.ingredients(store_id,name,category,unit,current_stock,min_stock,last_price)
    VALUES(sid,r.name,r.category,r.unit,r.stock,r.minimum,r.price) RETURNING id INTO iid;
    INSERT INTO rattle_demo_suppliers VALUES(iid,r.supplier);
  END LOOP;
  -- 레시피 원가는 연결 재료의 수량 × 단가와 정확히 일치한다.
  FOR r IN SELECT * FROM (VALUES
    ('채끝 스테이크','메인',32000,'{"한우 채끝":180,"샐러드 채소":60}'),
    ('크림 치킨 파스타','메인',18000,'{"닭다리살":100,"파스타면":120,"생크림":100}'),
    ('토마토 파스타','메인',16000,'{"파스타면":120,"토마토소스":180}'),
    ('아보카도 샐러드','샐러드',14000,'{"샐러드 채소":160,"아보카도":1}'),
    ('아메리카노','커피',5000,'{"블렌드 원두":18}'),
    ('카페라테','커피',6000,'{"블렌드 원두":18,"우유":180}'),
    ('레몬에이드','음료',6500,'{"레몬":1}'),
    ('하우스 와인','주류',9000,'{"하우스 와인":150}')
  ) v(name,category,price,parts) LOOP
    INSERT INTO public.recipes(store_id,name,category,selling_price) VALUES(sid,r.name,r.category,r.price) RETURNING id INTO rid;
    INSERT INTO public.recipe_ingredients(recipe_id,ingredient_id,quantity,unit)
      SELECT rid,i.id,p.value::numeric,i.unit FROM jsonb_each_text(r.parts::jsonb) p JOIN public.ingredients i ON i.store_id=sid AND i.name=p.key;
    SELECT sum(ri.quantity*i.last_price) INTO total FROM public.recipe_ingredients ri JOIN public.ingredients i ON i.id=ri.ingredient_id WHERE ri.recipe_id=rid;
    UPDATE public.recipes SET cost=total,margin_rate=round((r.price-total)/r.price*100,2) WHERE id=rid;
  END LOOP;

  -- 가상 직원 5명. 입사일부터 급여 이력을 만들어 미확인 조건이 생기지 않게 한다.
  FOR r IN SELECT * FROM (VALUES
    ('김하늘','regular',3400000,NULL::numeric,40),('이도윤','regular',3000000,NULL::numeric,40),
    ('박서연','regular',2800000,NULL::numeric,40),('정지우','part_time',0,13000,14),('최유진','part_time',0,12500,14)
  ) v(name,kind,salary,rate,hours) LOOP
    INSERT INTO public.employees(store_id,name,employment_type,base_salary,hourly_wage,non_taxable,joined_at,weekly_hours,dependents,is_active)
      VALUES(sid,r.name,r.kind,r.salary,r.rate,CASE WHEN r.kind='regular' THEN 200000 ELSE 0 END,first_month-180,r.hours,1,true) RETURNING id INTO eid;
    INSERT INTO public.employee_wage_history(store_id,employee_id,effective_date,base_salary,hourly_wage,non_taxable,memo,created_by)
      VALUES(sid,eid,first_month-180,r.salary,r.rate,CASE WHEN r.kind='regular' THEN 200000 ELSE 0 END,'최초 급여 조건 · 시연용',owner_uid);
    INSERT INTO public.employee_schedules(store_id,employee_id,day_of_week,is_working,start_time,end_time)
      SELECT sid,eid,w,CASE WHEN r.kind='regular' THEN w NOT IN (1,2) ELSE w IN (5,6,0) END,
        CASE WHEN r.kind='regular' THEN '10:00'::time ELSE '17:00'::time END,
        CASE WHEN r.kind='regular' THEN '19:00'::time ELSE '21:00'::time END FROM generate_series(0,6) w;
  END LOOP;

  -- 직전 2개월 전체 + 이번 달 오늘까지. 실제 POS 연결이나 외부 API 호출 없음.
  FOR d IN SELECT generate_series(first_month,today,'1 day')::date LOOP
    seq:=seq+1;
    revenue:=CASE WHEN extract(isodow FROM d) IN (5,6,7) THEN 1450000 ELSE 900000 END + ((extract(day FROM d)::int*7)%11)*15000
      + (extract(month FROM age(date_trunc('month',d),first_month))::int)*45000;
    INSERT INTO public.manual_sales(store_id,date,cash_amount,card_amount,discount_amount,memo,created_by)
      VALUES(sid,d,round(revenue*.08),revenue-round(revenue*.08),0,'일 매출 마감',owner_uid);
    -- 3일마다 식자재/주류/비품 매입. 품목 합계와 부모 매입 금액을 일치시킨다.
    IF seq%3=1 THEN
      FOR r IN SELECT DISTINCT ds.supplier_name supplier,i.category FROM public.ingredients i JOIN rattle_demo_suppliers ds ON ds.ingredient_id=i.id WHERE i.store_id=sid LOOP
        INSERT INTO public.purchases(store_id,date,supplier,amount,category,type,note)
          VALUES(sid,d,r.supplier,0,r.category,'수기','정기 입고') RETURNING id INTO pid;
        INSERT INTO public.purchase_items(purchase_id,store_id,ingredient_id,name,quantity,unit,unit_price,subtotal,category)
          SELECT pid,sid,i.id,i.name,
            CASE i.name WHEN '한우 채끝' THEN 9000 WHEN '닭다리살' THEN 12000 WHEN '파스타면' THEN 12000 WHEN '생크림' THEN 9000
              WHEN '토마토소스' THEN 10000 WHEN '샐러드 채소' THEN 7000 WHEN '아보카도' THEN 36 WHEN '블렌드 원두' THEN 3000
              WHEN '우유' THEN 12000 WHEN '레몬' THEN 30 WHEN '하우스 와인' THEN 4500 WHEN '크래프트 맥주' THEN 36
              WHEN '테이크아웃 컵' THEN 150 ELSE 60 END,
            i.unit,i.last_price,0,i.category FROM public.ingredients i JOIN rattle_demo_suppliers ds ON ds.ingredient_id=i.id WHERE i.store_id=sid AND ds.supplier_name=r.supplier AND i.category=r.category;
        UPDATE public.purchase_items SET subtotal=quantity*unit_price WHERE purchase_id=pid;
        UPDATE public.purchases SET amount=(SELECT sum(subtotal) FROM public.purchase_items WHERE purchase_id=pid) WHERE id=pid;
      END LOOP;
    END IF;
  END LOOP;
  -- 현재 재고는 소비 후 실사 수량이다. 과거 입고량을 다시 합산하지 않는다.
  FOR m IN SELECT generate_series(first_month,date_trunc('month',today),'1 month')::date LOOP
    ym:=to_char(m,'YYYY-MM'); days:=extract(day FROM (m+interval '1 month - 1 day'));
    INSERT INTO public.expenses(store_id,year_month,category,name,amount) VALUES
      (sid,ym,'고정비','매장 임대료',2800000),(sid,ym,'고정비','관리비',240000),
      (sid,ym,'공과금','전기·수도·가스',680000),(sid,ym,'마케팅','동네 소식·메뉴 홍보',220000),
      (sid,ym,'시설보수','커피머신 정기 관리',120000);
    FOR e IN SELECT * FROM public.employees WHERE store_id=sid LOOP
      minutes:=CASE WHEN e.employment_type='part_time' THEN (SELECT count(*)*240 FROM generate_series(m,least(today,(m+interval '1 month - 1 day')::date),'1 day') x WHERE extract(isodow FROM x) IN (5,6,7)) ELSE NULL END;
      gross:=CASE WHEN e.employment_type='part_time' THEN round(minutes*e.hourly_wage/60) ELSE e.base_salary END;
      deduction:=CASE WHEN e.employment_type='part_time' THEN floor(gross*.033/10)*10 ELSE round(gross*.09/10)*10 END;
      INSERT INTO public.payroll(store_id,employee_id,year_month,gross,taxable_base,national_pension,health_insurance,long_term_care,employment_insurance,income_tax,local_income_tax,withholding_tax,net_pay,worked_minutes,applied_hourly_wage,work_source,work_note,calculation_version)
      VALUES(sid,e.id,ym,gross,CASE WHEN e.employment_type='regular' THEN greatest(gross-200000,0) ELSE 0 END,
        CASE WHEN e.employment_type='regular' THEN floor(deduction*.45/10)*10 ELSE 0 END,
        CASE WHEN e.employment_type='regular' THEN floor(deduction*.30/10)*10 ELSE 0 END,
        CASE WHEN e.employment_type='regular' THEN floor(deduction*.04/10)*10 ELSE 0 END,
        CASE WHEN e.employment_type='regular' THEN floor(deduction*.08/10)*10 ELSE 0 END,
        CASE WHEN e.employment_type='regular' THEN deduction-floor(deduction*.45/10)*10-floor(deduction*.30/10)*10-floor(deduction*.04/10)*10-floor(deduction*.08/10)*10-floor(deduction*.01/10)*10 ELSE 0 END,
        CASE WHEN e.employment_type='regular' THEN floor(deduction*.01/10)*10 ELSE 0 END,
        CASE WHEN e.employment_type='part_time' THEN deduction ELSE 0 END,gross-deduction,minutes,e.hourly_wage,
        CASE WHEN e.employment_type='part_time' THEN 'manual' ELSE NULL END,'스크린샷용 가상 명세 · 공제는 예시 금액','demo-not-for-settlement');
    END LOOP;
    IF m<date_trunc('month',today)::date THEN UPDATE public.payroll SET is_settled=true,settled_at=(m+interval '1 month 5 days') WHERE store_id=sid AND year_month=ym; END IF;
  END LOOP;
  FOR r IN SELECT * FROM (VALUES
    ('open','입구와 홀 정돈',0),('open','냉장고 온도 확인',1),('open','식재료 상태·재고 확인',2),('open','오늘 예약과 스케줄 공유',3),
    ('close','남은 식재료 소분·라벨링',0),('close','주방과 홀 마감 청소',1),('close','매출·매입·비용 기록 확인',2),('close','전원과 출입문 확인',3),
    ('weekday','주간 냉장고 정리',0)
  ) v(segment,title,ord) LOOP
    INSERT INTO public.cleaning_items(store_id,segment,title,sort_order,weekday)
      VALUES(sid,r.segment,r.title,r.ord,CASE WHEN r.segment='weekday' THEN extract(dow FROM today) ELSE NULL END) RETURNING id INTO iid;
    INSERT INTO public.cleaning_logs(store_id,item_id,date,checked_by,checked_by_name,checked_at)
      SELECT sid,iid,x::date,owner_uid,'김하늘',(x::date+time '10:00') AT TIME ZONE 'Asia/Seoul'
      FROM generate_series(today-6,today,'1 day') x
      WHERE (r.segment<>'weekday' OR extract(dow FROM x)=extract(dow FROM today)) AND (x::date<today OR r.segment='open' OR (r.segment='close' AND r.ord<2));
  END LOOP;
  -- 발주는 현재 대기 1건. 입고 완료 시 재고 반영하는 기존 흐름을 체험할 수 있다.
  INSERT INTO public.orders(store_id,supplier_name,order_date,total_amount,status) VALUES(sid,'초록농장',today,0,'confirmed') RETURNING id INTO oid;
  INSERT INTO public.order_items(order_id,ingredient_id,quantity,unit,unit_price,subtotal)
    SELECT oid,id,CASE WHEN unit='g' THEN 5000 ELSE 24 END,unit,last_price,(CASE WHEN unit='g' THEN 5000 ELSE 24 END)*last_price
    FROM public.ingredients WHERE store_id=sid AND id IN (SELECT ingredient_id FROM rattle_demo_suppliers WHERE supplier_name='초록농장');
  UPDATE public.orders SET total_amount=(SELECT sum(subtotal) FROM public.order_items WHERE order_id=oid) WHERE id=oid;
  -- 금액 누락/단위 불일치를 발견하면 전체 트랜잭션을 중단한다.
  IF EXISTS(SELECT 1 FROM public.purchases p WHERE p.store_id=sid AND p.amount<>(SELECT sum(subtotal) FROM public.purchase_items WHERE purchase_id=p.id)) THEN RAISE EXCEPTION '매입 합계 불일치'; END IF;
  IF EXISTS(SELECT 1 FROM public.payroll pp WHERE pp.store_id=sid AND pp.net_pay<>pp.gross-pp.national_pension-pp.health_insurance-pp.long_term_care-pp.employment_insurance-pp.income_tax-pp.local_income_tax-pp.withholding_tax) THEN RAISE EXCEPTION '급여 합계 불일치'; END IF;
  RAISE NOTICE '래틀 데모 생성 완료: %, 기간 % ~ %. 운영 합산에는 이 가상 매장을 제외하세요.',sid,first_month,today;
END $demo$;
-- 실행 결과: 월별 손익의 재료 원가(매입), 급여, 고정비/변동비까지 검산.
SELECT m.year_month,m.revenue,coalesce(p.cost,0) purchase_cost,coalesce(w.cost,0) labor_cost,coalesce(e.cost,0) expenses,
  m.revenue-coalesce(p.cost,0)-coalesce(w.cost,0)-coalesce(e.cost,0) profit
FROM (SELECT to_char(date,'YYYY-MM') year_month,sum(cash_amount+card_amount) revenue FROM public.manual_sales WHERE store_id='7a771e00-1026-4000-8000-000000000001' GROUP BY 1) m
LEFT JOIN (SELECT to_char(date,'YYYY-MM') year_month,sum(amount) cost FROM public.purchases WHERE store_id='7a771e00-1026-4000-8000-000000000001' GROUP BY 1) p USING(year_month)
LEFT JOIN (SELECT year_month,sum(gross) cost FROM public.payroll WHERE store_id='7a771e00-1026-4000-8000-000000000001' GROUP BY 1) w USING(year_month)
LEFT JOIN (SELECT year_month,sum(amount) cost FROM public.expenses WHERE store_id='7a771e00-1026-4000-8000-000000000001' GROUP BY 1) e USING(year_month)
ORDER BY m.year_month;
COMMIT;
