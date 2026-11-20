-- 1.1.0 매입 입력 방식. 20261120120000 다음에 적용한다. 이전 RPC는 그대로 호출할 수 있다.
BEGIN;

-- 신규 매장만 1.1.0 기본 세 분류로 시작한다. 기존 매장의 주류·사용자 분류와 순서는 보존한다.
ALTER TABLE public.stores ALTER COLUMN purchase_categories SET DEFAULT ARRAY['식자재','비품','소모품'];

-- 한 영수증은 매입 한 건이다. 금액별 입력은 품목·재고와 독립된 카테고리별 원 금액이다.
CREATE TABLE IF NOT EXISTS public.purchase_amount_lines (
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.store_taxonomies(id) DEFERRABLE INITIALLY DEFERRED,
  amount numeric(12,0) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (purchase_id,category_id)
);
CREATE INDEX IF NOT EXISTS purchase_amount_lines_category_idx ON public.purchase_amount_lines(category_id);
ALTER TABLE public.purchase_amount_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_amount_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.purchase_amount_lines TO authenticated;
DROP POLICY IF EXISTS purchase_amount_read ON public.purchase_amount_lines;
CREATE POLICY purchase_amount_read ON public.purchase_amount_lines FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id=purchase_id
  AND public.is_store_member(p.store_id) AND public.can_read_store_financials(p.store_id)));

-- 분류 삭제는 품목과 마찬가지로 기타에 합친다. 배열 동기화가 잠시 비활성으로
-- 바꾼 뒤 다시 켜는 분류가 있으므로 트랜잭션의 최종 상태에서만 옮긴다.
CREATE OR REPLACE FUNCTION public.reclassify_purchase_amount_lines() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fallback uuid; affected uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.store_taxonomies WHERE id=NEW.id AND NOT is_active)
     OR NOT EXISTS (SELECT 1 FROM public.purchase_amount_lines WHERE category_id=NEW.id) THEN RETURN NULL; END IF;
  fallback := public.resolve_store_taxonomy(NEW.store_id,'purchase','기타');
  FOR affected IN
    WITH moved AS (
      DELETE FROM public.purchase_amount_lines WHERE category_id=NEW.id RETURNING purchase_id,amount
    )
    INSERT INTO public.purchase_amount_lines AS existing(purchase_id,category_id,amount)
    SELECT purchase_id,fallback,amount FROM moved ORDER BY purchase_id
    ON CONFLICT(purchase_id,category_id) DO UPDATE SET amount=existing.amount+excluded.amount
    RETURNING existing.purchase_id
  LOOP
    PERFORM private.refresh_purchase_totals(affected);
  END LOOP;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.reclassify_purchase_amount_lines() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS reclassify_purchase_amount_lines ON public.store_taxonomies;
CREATE CONSTRAINT TRIGGER reclassify_purchase_amount_lines AFTER UPDATE ON public.store_taxonomies
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  WHEN (NEW.domain='purchase' AND NEW.name<>'기타' AND OLD.is_active AND NOT NEW.is_active)
  EXECUTE FUNCTION public.reclassify_purchase_amount_lines();

-- 헤더 직접 수정이나 기존 품목 API로 금액별 원장의 총액·매장·입력 방식이 어긋나는 것을 막는다.
CREATE OR REPLACE FUNCTION public.guard_purchase_amount_lines() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE allocated numeric;
BEGIN
  IF TG_TABLE_NAME='purchase_items' THEN
    IF EXISTS (SELECT 1 FROM public.purchase_amount_lines WHERE purchase_id=NEW.purchase_id) THEN
      RAISE EXCEPTION 'PURCHASE_MODE_MISMATCH';
    END IF;
  ELSE
    SELECT sum(amount) INTO allocated FROM public.purchase_amount_lines WHERE purchase_id=OLD.id;
    IF allocated IS NOT NULL AND (NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.amount IS DISTINCT FROM allocated) THEN
      RAISE EXCEPTION 'PURCHASE_AMOUNT_MISMATCH';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_purchase_amount_lines() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_purchase_amount_header ON public.purchases;
CREATE TRIGGER guard_purchase_amount_header BEFORE UPDATE OF amount,store_id ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_amount_lines();
DROP TRIGGER IF EXISTS guard_purchase_amount_items ON public.purchase_items;
CREATE TRIGGER guard_purchase_amount_items BEFORE INSERT OR UPDATE OF purchase_id ON public.purchase_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_amount_lines();

-- PostgREST computed field: purchases.select('*,category_amounts'). 품목과 금액 행이
-- 모두 없는 구버전 단일금액 건은 기존 헤더 금액을 쓴다. 매입 1건은 항상 목록 1행이다.
CREATE OR REPLACE FUNCTION public.category_amounts(public.purchases) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT coalesce(jsonb_object_agg(lines.category, lines.amount),
                  jsonb_build_object(coalesce($1.category,'기타'), $1.amount))
  FROM (
    SELECT category,sum(amount) AS amount FROM (
      SELECT coalesce(i.category,'기타') AS category,i.subtotal AS amount
      FROM public.purchase_items i WHERE i.purchase_id=$1.id
      UNION ALL
      SELECT t.name,l.amount FROM public.purchase_amount_lines l
      JOIN public.store_taxonomies t ON t.id=l.category_id WHERE l.purchase_id=$1.id
    ) AS rows GROUP BY category
  ) AS lines;
$$;

-- 호출자가 매입을 선점한 뒤 실행한다. 구앱이 한 분류만 읽으므로 총액이 가장 큰
-- 분류를 대표로 쓴다. 동률은 입력 순서에 무관하게 분류 이름의 바이트 순서로 정한다.
CREATE OR REPLACE FUNCTION private.refresh_purchase_totals(p_id uuid) RETURNS void
LANGUAGE sql SET search_path='' AS $$
  WITH totals AS (
    SELECT c.key AS name,c.value::numeric AS amount
    FROM public.purchases p, jsonb_each_text(public.category_amounts(p)) c WHERE p.id=p_id
  )
  UPDATE public.purchases SET amount=(SELECT sum(amount) FROM totals),
    category=(SELECT name FROM totals ORDER BY amount DESC,name COLLATE "C" LIMIT 1)
  WHERE id=p_id;
$$;
REVOKE ALL ON FUNCTION private.refresh_purchase_totals(uuid) FROM PUBLIC, anon, authenticated;

-- 선택적 p_purchase_id는 금액별 매입을 같은 UUID에서 수정한다. 증빙은 그대로 연결된다.
CREATE OR REPLACE FUNCTION public.create_purchase_entry(
  p_store_id uuid,p_date date,p_supplier text,p_type text,p_mode text,p_rows jsonb,p_purchase_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  row_data jsonb;
  line_amount numeric;
  total numeric := 0;
  category_id_for_line uuid;
  purchase_id_for_rows uuid;
  has_rows boolean := false;
  quantity_for_line numeric;
  unit_for_line text;
  price_for_unit numeric;
  ingredient uuid;
BEGIN
  PERFORM 1 FROM public.stores WHERE id=p_store_id AND deleted_at IS NULL
    AND public.is_store_member(p_store_id) FOR SHARE;
  IF NOT FOUND OR NOT coalesce(public.can_read_store_financials(p_store_id),false) THEN
    RAISE EXCEPTION 'FINANCIAL_SHARING_DENIED' USING ERRCODE='42501';
  END IF;
  IF p_date IS NULL OR p_mode IS NULL OR p_mode NOT IN ('items','amounts')
     OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;
  IF jsonb_array_length(p_rows) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;
  IF nullif(btrim(p_supplier),'') IS NULL THEN RAISE EXCEPTION 'PURCHASE_INVALID_SUPPLIER'; END IF;

  IF p_purchase_id IS NOT NULL THEN
    SELECT p.id INTO purchase_id_for_rows FROM public.purchases p WHERE p.id=p_purchase_id AND p.store_id=p_store_id FOR UPDATE;
    IF NOT FOUND OR p_mode<>'amounts' OR NOT EXISTS (
      SELECT 1 FROM public.purchase_amount_lines WHERE purchase_id=purchase_id_for_rows
    ) THEN RAISE EXCEPTION 'PURCHASE_AMOUNT_ENTRY_NOT_FOUND'; END IF;
    DELETE FROM public.purchase_amount_lines WHERE purchase_id=purchase_id_for_rows;
  END IF;
  IF p_mode='items' THEN
    PERFORM 1 FROM public.ingredients i WHERE i.store_id=p_store_id AND
      i.id IN (SELECT nullif(x->>'ingredient_id','')::uuid FROM jsonb_array_elements(p_rows) x)
      ORDER BY i.id FOR UPDATE;
  END IF;
  FOR row_data IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF jsonb_typeof(row_data) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;
    IF p_mode='amounts' AND nullif(btrim(row_data->>'amount'),'') IS NULL THEN CONTINUE; END IF;
    IF jsonb_typeof(row_data->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT'; END IF;
    line_amount := (row_data->>'amount')::numeric;
    IF line_amount<0 OR line_amount<>trunc(line_amount) THEN RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT'; END IF;
    IF p_mode='amounts' AND line_amount=0 THEN CONTINUE; END IF;
    total := total+line_amount;
    IF total>=1000000000000 THEN RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT'; END IF;
    IF jsonb_typeof(row_data->'category') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'PURCHASE_INVALID_CATEGORY'; END IF;
    SELECT t.id INTO category_id_for_line FROM public.store_taxonomies t WHERE
      t.store_id=p_store_id AND t.domain='purchase' AND t.is_active AND t.name=btrim(row_data->>'category');
    IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_INVALID_CATEGORY'; END IF;

    has_rows := true;
    IF purchase_id_for_rows IS NULL THEN
      -- 종전 클라이언트용 대표 분류. 새 목록·손익은 category_amounts를 사용한다.
      INSERT INTO public.purchases(store_id,date,supplier,type,category_id,amount)
      VALUES(p_store_id,p_date,btrim(p_supplier),p_type,category_id_for_line,0)
      RETURNING id INTO purchase_id_for_rows;
    END IF;
    IF p_mode='amounts' THEN
      INSERT INTO public.purchase_amount_lines(purchase_id,category_id,amount)
      VALUES(purchase_id_for_rows,category_id_for_line,line_amount);
      CONTINUE;
    END IF;

    IF jsonb_typeof(row_data->'name') IS DISTINCT FROM 'string'
       OR length(btrim(row_data->>'name')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;
    IF coalesce(jsonb_typeof(row_data->'quantity'),'null') NOT IN ('number','null') THEN RAISE EXCEPTION 'PURCHASE_INVALID_QUANTITY'; END IF;
    quantity_for_line := coalesce((row_data->>'quantity')::numeric,1);
    IF quantity_for_line<=0 OR quantity_for_line>=1000000000 THEN RAISE EXCEPTION 'PURCHASE_INVALID_QUANTITY'; END IF;
    price_for_unit := line_amount/quantity_for_line;
    ingredient := nullif(row_data->>'ingredient_id','')::uuid;
    IF coalesce(jsonb_typeof(row_data->'unit'),'null') NOT IN ('null','string') THEN RAISE EXCEPTION 'PURCHASE_INVALID_ITEMS'; END IF;
    unit_for_line := btrim(row_data->>'unit');
    IF ingredient IS NOT NULL THEN
      SELECT i.unit INTO unit_for_line FROM public.ingredients i WHERE i.id=ingredient AND i.store_id=p_store_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_INGREDIENT_STORE_MISMATCH'; END IF;
      IF nullif(btrim(row_data->>'unit'),'') IS NOT NULL AND btrim(row_data->>'unit') IS DISTINCT FROM unit_for_line THEN
        RAISE EXCEPTION 'PURCHASE_INGREDIENT_UNIT_CHANGED';
      END IF;
      UPDATE public.ingredients SET current_stock=current_stock+quantity_for_line,last_price=price_for_unit,updated_at=now()
      WHERE id=ingredient AND store_id=p_store_id;
    END IF;
    INSERT INTO public.purchase_items(purchase_id,store_id,category_id,ingredient_id,name,quantity,unit,unit_price,subtotal)
    VALUES(purchase_id_for_rows,p_store_id,category_id_for_line,ingredient,btrim(row_data->>'name'),quantity_for_line,
           coalesce(unit_for_line,''),price_for_unit,line_amount);
  END LOOP;
  IF NOT has_rows THEN RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT'; END IF;
  IF p_purchase_id IS NOT NULL THEN
    UPDATE public.purchases SET date=p_date,supplier=btrim(p_supplier),type=p_type WHERE id=purchase_id_for_rows;
  END IF;
  PERFORM private.refresh_purchase_totals(purchase_id_for_rows);
  RETURN purchase_id_for_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.create_purchase_entry(uuid,date,text,text,text,jsonb,uuid), public.category_amounts(public.purchases) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_entry(uuid,date,text,text,text,jsonb,uuid), public.category_amounts(public.purchases) TO authenticated;

-- 수량만 바꿀 때는 잠금 후 읽은 소계를 보존한다. 과거 소수 원 소계는 수정 시 원 단위로 반올림한다.
CREATE OR REPLACE FUNCTION private.edit_purchase_item(p_item_id uuid,p_quantity numeric,p_amount numeric,p_expected_price numeric)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  parent_id uuid;
  parent_store uuid;
  old_item public.purchase_items%ROWTYPE;
  amount_won numeric;
  price numeric;
BEGIN
  SELECT p.id,p.store_id INTO parent_id,parent_store FROM public.purchases p
  JOIN public.purchase_items i ON i.purchase_id=p.id AND i.store_id=p.store_id
  WHERE i.id=p_item_id AND public.is_store_member(p.store_id) AND public.can_read_store_financials(p.store_id)
  FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_SHARING_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT old_item FROM public.purchase_items WHERE purchase_id=parent_id AND id=p_item_id FOR UPDATE;
  IF p_expected_price IS NOT NULL AND old_item.unit_price::double precision IS DISTINCT FROM p_expected_price::double precision THEN
    RAISE EXCEPTION 'PURCHASE_EDIT_AMOUNT_REQUIRED';
  END IF;
  amount_won := coalesce(p_amount,round(old_item.subtotal));
  IF p_quantity IS NULL OR p_quantity<=0 OR p_quantity>=1000000000 OR amount_won<0
     OR amount_won>=1000000000000 OR amount_won<>trunc(amount_won) THEN RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT'; END IF;
  price := amount_won/p_quantity;
  IF price>=1000000000 THEN RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT'; END IF;
  UPDATE public.purchase_items SET quantity=p_quantity,unit_price=price,subtotal=amount_won WHERE id=p_item_id;
  -- 구버전의 소수 원 형제 품목은 이 영수증의 종전 반올림 합계를 보존하도록
  -- 나머지가 큰 행부터 1원씩 배분한다. 정수 원 기록과 다른 영수증은 건드리지 않는다.
  WITH fractions AS (
    SELECT id,floor(subtotal) AS whole,
      row_number() OVER (ORDER BY subtotal-floor(subtotal) DESC,id) AS priority,
      round(old_item.subtotal+sum(subtotal-floor(subtotal)) OVER ())-round(old_item.subtotal) AS extra
    FROM public.purchase_items WHERE purchase_id=parent_id AND id<>p_item_id AND subtotal<>round(subtotal)
  )
  UPDATE public.purchase_items i SET subtotal=f.whole+CASE WHEN f.priority<=f.extra THEN 1 ELSE 0 END
  FROM fractions f WHERE i.id=f.id;
  UPDATE public.ingredients SET current_stock=current_stock+(p_quantity-old_item.quantity),
    last_price=price,updated_at=now() WHERE store_id=parent_store AND id=old_item.ingredient_id;
  PERFORM private.refresh_purchase_totals(parent_id);
END;
$$;

REVOKE ALL ON FUNCTION private.edit_purchase_item(uuid,numeric,numeric,numeric) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.update_purchase_item_amount(p_item_id uuid,p_quantity numeric,p_amount numeric)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT private.edit_purchase_item(p_item_id,p_quantity,p_amount,NULL);
$$;
-- 구앱의 수량 수정도 금액을 유지한다. 구앱에서 단가를 직접 바꾸면 저장 전에 거절한다.
CREATE OR REPLACE FUNCTION public.update_purchase_item(p_item_id uuid,p_quantity numeric,p_unit_price numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_unit_price IS NULL OR p_unit_price<0 OR p_unit_price>=1000000000 THEN RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT'; END IF;
  PERFORM private.edit_purchase_item(p_item_id,p_quantity,NULL,p_unit_price);
END;
$$;
REVOKE ALL ON FUNCTION public.update_purchase_item_amount(uuid,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_item_amount(uuid,numeric,numeric) TO authenticated;
-- 앱의 품목 쓰기는 입고를 함께 반영하는 RPC를 거친다.
REVOKE INSERT,UPDATE,DELETE ON public.purchase_items FROM PUBLIC,anon,authenticated;

-- 부모 DELETE로 획득한 행 잠금이 수정·재삭제를 직렬화한다. 증빙 FK가 막으면 재고도 롤백한다.
-- 구앱의 직접 DELETE 역시 같은 트리거를 거친다.
CREATE OR REPLACE FUNCTION private.reverse_purchase_stock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  received record;
BEGIN
  FOR received IN
    SELECT ingredient_id,sum(quantity) AS quantity FROM public.purchase_items
    WHERE purchase_id=OLD.id AND store_id=OLD.store_id AND ingredient_id IS NOT NULL
    GROUP BY ingredient_id ORDER BY ingredient_id
  LOOP
    UPDATE public.ingredients SET current_stock=current_stock-received.quantity,updated_at=now()
    WHERE id=received.ingredient_id AND store_id=OLD.store_id;
  END LOOP;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION private.reverse_purchase_stock() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS reverse_purchase_stock ON public.purchases;
CREATE TRIGGER reverse_purchase_stock BEFORE DELETE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION private.reverse_purchase_stock();

CREATE OR REPLACE FUNCTION public.delete_purchase_entry(p_purchase_id uuid) RETURNS boolean
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  WITH removed AS (DELETE FROM public.purchases WHERE id=p_purchase_id RETURNING id)
  SELECT EXISTS (SELECT 1 FROM removed);
$$;
REVOKE ALL ON FUNCTION public.delete_purchase_entry(uuid),public.update_purchase_item(uuid,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_purchase_entry(uuid),public.update_purchase_item(uuid,numeric,numeric) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
