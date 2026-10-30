BEGIN;
ALTER TABLE public.payroll ADD COLUMN IF NOT EXISTS calculation_version text;

-- 기존 permissive 정책이 새 정책과 OR로 결합되지 않도록 해당 도메인 정책을 교체한다.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'
    AND tablename IN ('employees','payroll','payroll_work_history','employee_wage_history')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.can_read_employee(p_store_id uuid,p_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_store_member(p_store_id) AND (
    public.is_store_admin(p_store_id) OR EXISTS (
      SELECT 1 FROM employees e WHERE e.id=p_employee_id AND e.store_id=p_store_id
        AND e.user_id=auth.uid() AND e.is_active
    )
  );
$$;
REVOKE ALL ON FUNCTION public.can_read_employee(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_employee(uuid,uuid) TO authenticated;
CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated
  USING(public.can_read_employee(store_id,id));
CREATE POLICY employees_insert ON public.employees FOR INSERT TO authenticated WITH CHECK(public.is_store_admin(store_id));
CREATE POLICY employees_update ON public.employees FOR UPDATE TO authenticated USING(public.is_store_admin(store_id)) WITH CHECK(public.is_store_admin(store_id));
CREATE POLICY employees_delete ON public.employees FOR DELETE TO authenticated USING(public.is_store_admin(store_id));
CREATE POLICY payroll_read ON public.payroll FOR SELECT TO authenticated USING(public.can_read_employee(store_id,employee_id));
CREATE POLICY payroll_write ON public.payroll FOR ALL TO authenticated USING(public.is_store_admin(store_id)) WITH CHECK(public.is_store_admin(store_id));
CREATE POLICY payroll_work_history_read ON public.payroll_work_history FOR SELECT TO authenticated USING(public.can_read_employee(store_id,employee_id));
CREATE POLICY wage_history_select ON public.employee_wage_history FOR SELECT TO authenticated USING(public.can_read_employee(store_id,employee_id));
CREATE POLICY wage_history_write ON public.employee_wage_history FOR ALL TO authenticated
  USING(public.is_store_admin(store_id)) WITH CHECK(public.is_store_admin(store_id) AND EXISTS (
    SELECT 1 FROM public.employees e WHERE e.id=employee_id AND e.store_id=employee_wage_history.store_id
  ));

-- RPC와 직접 품목 변경 모두 매장 간 잘못된 연결을 차단한다.
CREATE OR REPLACE FUNCTION public.validate_purchase_item_store() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM purchases p WHERE p.id=NEW.purchase_id AND p.store_id=NEW.store_id) THEN
    RAISE EXCEPTION 'PURCHASE_STORE_MISMATCH';
  END IF;
  IF NEW.ingredient_id IS NOT NULL THEN
    PERFORM 1 FROM ingredients i WHERE i.id=NEW.ingredient_id AND i.store_id=NEW.store_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_INGREDIENT_STORE_MISMATCH'; END IF;
  END IF;
  IF NEW.quantity IS NULL OR NEW.quantity::text IN ('NaN','Infinity','-Infinity') OR NEW.quantity<=0 OR NEW.quantity>=1000000000
    OR NEW.unit_price IS NULL OR NEW.unit_price::text IN ('NaN','Infinity','-Infinity') OR NEW.unit_price<0
    OR NEW.unit_price>=1000000000 OR NEW.quantity*NEW.unit_price>=1000000000000 THEN
    RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_purchase_item_store ON public.purchase_items;
CREATE TRIGGER validate_purchase_item_store BEFORE INSERT OR UPDATE ON public.purchase_items
FOR EACH ROW EXECUTE FUNCTION public.validate_purchase_item_store();

CREATE OR REPLACE FUNCTION public.create_purchase_with_items(p_store_id uuid,p_date date,p_supplier text,p_type text,p_items jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_item jsonb; v_id uuid; v_total numeric; v_category text;
BEGIN
  IF NOT public.is_store_member(p_store_id) THEN RAISE EXCEPTION 'PURCHASE_FORBIDDEN'; END IF;
  IF p_date IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;
  -- 같은 재료를 등록하는 동시 요청은 일정한 순서로 잠근다.
  PERFORM 1 FROM ingredients i WHERE i.store_id=p_store_id
    AND i.id IN (SELECT NULLIF(x->>'ingredient_id','')::uuid FROM jsonb_array_elements(p_items) x)
    ORDER BY i.id FOR UPDATE;
  SELECT sum((x->>'quantity')::numeric*(x->>'unit_price')::numeric) INTO v_total FROM jsonb_array_elements(p_items) x;
  IF v_total IS NULL OR v_total::text IN ('NaN','Infinity','-Infinity') OR v_total<0 OR v_total>=1000000000000 THEN
    RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT';
  END IF;
  SELECT map_purchase_category(coalesce(x->>'category','기타')) INTO v_category FROM jsonb_array_elements(p_items) x
    GROUP BY map_purchase_category(coalesce(x->>'category','기타'))
    ORDER BY sum((x->>'quantity')::numeric*(x->>'unit_price')::numeric) DESC LIMIT 1;
  INSERT INTO purchases(store_id,date,supplier,amount,category,type,note)
    VALUES(p_store_id,p_date,coalesce(p_supplier,''),v_total,coalesce(v_category,'기타'),p_type,NULL) RETURNING id INTO v_id;
  FOR v_item IN SELECT x FROM jsonb_array_elements(p_items) x LOOP
    IF length(btrim(coalesce(v_item->>'name',''))) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;
    INSERT INTO purchase_items(purchase_id,store_id,ingredient_id,name,quantity,unit,unit_price,subtotal,category)
      VALUES(v_id,p_store_id,NULLIF(v_item->>'ingredient_id','')::uuid,btrim(v_item->>'name'),(v_item->>'quantity')::numeric,
      coalesce(v_item->>'unit',''),(v_item->>'unit_price')::numeric,(v_item->>'quantity')::numeric*(v_item->>'unit_price')::numeric,v_item->>'category');
    UPDATE ingredients SET current_stock=current_stock+(v_item->>'quantity')::numeric,last_price=(v_item->>'unit_price')::numeric,updated_at=now()
      WHERE id=NULLIF(v_item->>'ingredient_id','')::uuid AND store_id=p_store_id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.update_purchase_item(p_item_id uuid,p_quantity numeric,p_unit_price numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old purchase_items%ROWTYPE; v_parent uuid;
BEGIN
  SELECT purchase_id INTO v_parent FROM purchase_items WHERE id=p_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_NOT_FOUND'; END IF;
  -- 합계를 공유하는 매입 건을 먼저 잠그고 최신 품목의 차액을 계산한다.
  PERFORM 1 FROM purchases WHERE id=v_parent AND public.is_store_member(store_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_FORBIDDEN'; END IF;
  SELECT * INTO v_old FROM purchase_items WHERE id=p_item_id AND purchase_id=v_parent FOR UPDATE;
  IF NOT FOUND OR NOT public.is_store_member(v_old.store_id) THEN RAISE EXCEPTION 'PURCHASE_NOT_FOUND'; END IF;
  UPDATE purchase_items SET quantity=p_quantity,unit_price=p_unit_price,subtotal=p_quantity*p_unit_price WHERE id=p_item_id;
  UPDATE purchases SET amount=amount-v_old.subtotal+p_quantity*p_unit_price WHERE id=v_parent;
  UPDATE ingredients SET current_stock=current_stock+p_quantity-v_old.quantity,last_price=p_unit_price,updated_at=now()
    WHERE id=v_old.ingredient_id AND store_id=v_old.store_id;
END $$;
REVOKE ALL ON FUNCTION public.create_purchase_with_items(uuid,date,text,text,jsonb), public.update_purchase_item(uuid,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_items(uuid,date,text,text,jsonb), public.update_purchase_item(uuid,numeric,numeric) TO authenticated;
CREATE OR REPLACE FUNCTION public.assert_store_finance_access(p_store_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION 'FINANCE_ADMIN_REQUIRED'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_store_finance_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assert_store_finance_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.validate_recipe_ingredient_store() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipe_store uuid;
BEGIN
  SELECT store_id INTO recipe_store FROM recipes WHERE id=NEW.recipe_id;
  PERFORM 1 FROM ingredients WHERE id=NEW.ingredient_id AND store_id=recipe_store FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RECIPE_INGREDIENT_STORE_MISMATCH'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_recipe_ingredient_store BEFORE INSERT OR UPDATE ON public.recipe_ingredients
FOR EACH ROW EXECUTE FUNCTION public.validate_recipe_ingredient_store();

-- 앱에서 제거된 과거 발주 RPC로 재고를 직접 증가시키는 우회도 닫는다.
DO $$ DECLARE signature text; BEGIN
  FOREACH signature IN ARRAY ARRAY['public.deliver_order(uuid)','public.create_order_with_items(uuid,text,date,jsonb)'] LOOP
    IF to_regprocedure(signature) IS NOT NULL THEN
      EXECUTE 'REVOKE ALL ON FUNCTION ' || signature || ' FROM PUBLIC,anon,authenticated';
    END IF;
  END LOOP;
END $$;
COMMIT;
