-- 매입 등록 1.1.0. 선행 20261119141000. 반환된 매입 UUID로 기존 증빙 예약을 호출한다.
-- 적용 실패 시 트랜잭션 전체가 롤백된다. 앱 롤백 시에는 기존 등록 RPC를 사용한다.
BEGIN;

ALTER TABLE public.stores ALTER COLUMN purchase_categories
  SET DEFAULT ARRAY['식자재', '주류', '비품', '소모품'];

-- 배열이 원본이며 sync_store_taxonomy_arrays가 같은 트랜잭션에서 활성 분류를 갱신한다.
-- 이미 비활성화한 분류도 사용자 설정이므로 되살리지 않는다.
UPDATE public.stores s
SET purchase_categories = array_append(s.purchase_categories, '소모품')
WHERE s.deleted_at IS NULL AND NOT ('소모품' = ANY(s.purchase_categories))
  AND NOT EXISTS (SELECT 1 FROM public.store_taxonomies t
                  WHERE t.store_id=s.id AND t.domain='purchase' AND t.name='소모품');

-- 설치 시점에 삭제 유예 중이던 매장만 복구 직후 보완한다.
-- 이후 매장에서 기본값을 변경한 뒤 삭제·복구해도 재추가하지 않는다.
CREATE OR REPLACE FUNCTION public.add_restored_store_consumables() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  UPDATE public.stores SET purchase_categories=array_append(purchase_categories, '소모품')
  WHERE id=NEW.id AND NOT ('소모품'=ANY(purchase_categories))
    AND NOT EXISTS (SELECT 1 FROM public.store_taxonomies t
                    WHERE t.store_id=NEW.id AND t.domain='purchase' AND t.name='소모품');
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.add_restored_store_consumables() FROM PUBLIC, anon, authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stores WHERE deleted_at IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.stores'::regclass AND tgname='add_restored_store_consumables') THEN
    EXECUTE format('CREATE TRIGGER add_restored_store_consumables AFTER UPDATE OF deleted_at ON public.stores
      FOR EACH ROW WHEN (OLD.deleted_at <= %L::timestamptz AND NEW.deleted_at IS NULL)
      EXECUTE FUNCTION public.add_restored_store_consumables()', clock_timestamp());
  END IF;
END;
$$;

-- p_category는 해당 매장의 활성 purchase 도메인 이름이다. 구버전 RPC는 기존 계약을 유지한다.
CREATE OR REPLACE FUNCTION public.create_purchase_with_amounts(
  p_store_id uuid, p_date date, p_supplier text, p_type text, p_category text, p_items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  category_id_for_purchase uuid;
  new_purchase_id uuid;
  total_amount numeric;
  item jsonb;
  item_amount numeric;
  qty numeric;
  price numeric;
  stock_id uuid;
BEGIN
  -- 분류 수정·매장 삭제와 같은 순서로 매장을 먼저 잠근 뒤 현재 공유 범위를 확인한다.
  PERFORM 1 FROM public.stores WHERE id=p_store_id AND deleted_at IS NULL
    AND public.is_store_member(p_store_id) FOR SHARE;
  IF NOT FOUND OR NOT coalesce(public.can_read_store_financials(p_store_id), false) THEN
    RAISE EXCEPTION 'FINANCIAL_SHARING_DENIED' USING ERRCODE='42501';
  END IF;
  SELECT id INTO category_id_for_purchase FROM public.store_taxonomies
    WHERE store_id=p_store_id AND domain='purchase' AND is_active AND name=btrim(p_category);
  IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_INVALID_CATEGORY'; END IF;

  IF nullif(btrim(p_supplier),'') IS NULL THEN RAISE EXCEPTION 'PURCHASE_INVALID_SUPPLIER'; END IF;
  IF p_date IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;

  SELECT sum((x->>'amount')::numeric) INTO total_amount FROM jsonb_array_elements(p_items) AS x;
  IF total_amount IS NULL OR total_amount<0 OR total_amount>=1000000000000 THEN
    RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT';
  END IF;
  PERFORM 1 FROM public.ingredients i WHERE i.store_id=p_store_id
    AND i.id IN (SELECT nullif(x->>'ingredient_id','')::uuid FROM jsonb_array_elements(p_items) AS x)
    ORDER BY i.id FOR UPDATE;

  INSERT INTO public.purchases(store_id,date,supplier,amount,category_id,type)
  VALUES(p_store_id,p_date,btrim(p_supplier),total_amount,category_id_for_purchase,p_type)
  RETURNING id INTO new_purchase_id;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(item->'name') IS DISTINCT FROM 'string'
       OR length(btrim(item->>'name')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;
    item_amount := (item->>'amount')::numeric;
    IF jsonb_typeof(item->'amount') IS DISTINCT FROM 'number'
       OR item_amount<0 OR item_amount<>trunc(item_amount) THEN RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT'; END IF;
    IF coalesce(jsonb_typeof(item->'quantity'),'null') NOT IN ('number','null') THEN
      RAISE EXCEPTION 'PURCHASE_INVALID_QUANTITY';
    END IF;
    qty := coalesce((item->>'quantity')::numeric,1);
    IF qty<=0 OR qty>=1000000000 THEN RAISE EXCEPTION 'PURCHASE_INVALID_QUANTITY'; END IF;
    price := item_amount / qty;
    stock_id := nullif(item->>'ingredient_id','')::uuid;

    -- 손익의 분류별 합계는 품목 소계를 읽는다. 저장한 원 금액과 건 분류를 각 줄에도 기록한다.
    -- 기존 validate_purchase_item_store 트리거가 재료의 매장과 수량·단가 한도를 검사한다.
    INSERT INTO public.purchase_items(purchase_id,store_id,ingredient_id,name,quantity,unit,unit_price,subtotal,category_id)
    VALUES(new_purchase_id,p_store_id,stock_id,btrim(item->>'name'),qty,coalesce(item->>'unit',''),price,item_amount,category_id_for_purchase);
    IF stock_id IS NOT NULL THEN
      UPDATE public.ingredients SET current_stock=current_stock+qty,last_price=price,updated_at=now()
      WHERE id=stock_id AND store_id=p_store_id;
    END IF;
  END LOOP;
  RETURN new_purchase_id;
END;
$$;

-- PostgREST에서 페이지를 나눠 조회할 수 있게 고유 거래처명을 매장별 최근 매입일 순으로 반환한다.
CREATE OR REPLACE FUNCTION public.list_purchase_suppliers(p_store_id uuid) RETURNS TABLE(supplier text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT btrim(p.supplier) FROM public.purchases p
  WHERE p.store_id=p_store_id AND btrim(p.supplier)<>''
    AND public.is_store_member(p_store_id) AND public.can_read_store_financials(p_store_id)
  GROUP BY btrim(p.supplier) ORDER BY max(p.date) DESC, btrim(p.supplier);
$$;
REVOKE ALL ON FUNCTION public.create_purchase_with_amounts(uuid,date,text,text,text,jsonb),
  public.list_purchase_suppliers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_with_amounts(uuid,date,text,text,text,jsonb),
  public.list_purchase_suppliers(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
