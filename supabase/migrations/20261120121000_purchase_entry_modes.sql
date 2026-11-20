-- 1.1.0 매입 입력 방식. 20261120120000 다음에 적용한다. 이전 RPC는 그대로 호출할 수 있다.
BEGIN;

ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS edit_version bigint NOT NULL DEFAULT 1;
CREATE OR REPLACE FUNCTION private.bump_purchase_version() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  NEW.edit_version := OLD.edit_version+1;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bump_purchase_version ON public.purchases;
CREATE TRIGGER bump_purchase_version BEFORE UPDATE ON public.purchases
FOR EACH ROW EXECUTE FUNCTION private.bump_purchase_version();

-- 한 트랜잭션의 여러 입고 행에도 실제 입력 순서가 남는다. 과거 동시각 행은 UUID로 정렬한다.
ALTER TABLE public.purchase_items ALTER COLUMN created_at SET DEFAULT clock_timestamp();
CREATE INDEX IF NOT EXISTS purchase_items_ingredient_receipt_idx ON public.purchase_items
  (store_id,ingredient_id,created_at DESC,id DESC) WHERE ingredient_id IS NOT NULL;

-- 재료마다 마지막 직접 입력값과 변경 번호를 보관한다. 같은 번호로 입고된 행만
-- 복원 후보가 되므로 수동 변경과 입고의 시각이 같아도 이전 단가가 되살아나지 않는다.
-- 이관 이전 입고의 기준가는 현재 자료로 확인되는 경우만 기록한다. 0원과 NULL은 별개다.
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS price_before_purchases numeric,
  ADD COLUMN IF NOT EXISTS manual_price_version bigint NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS manual_price_version bigint NOT NULL DEFAULT 0;
WITH latest AS (
  SELECT DISTINCT ON (store_id,ingredient_id) store_id,ingredient_id,unit_price
  FROM public.purchase_items WHERE ingredient_id IS NOT NULL
  ORDER BY store_id,ingredient_id,created_at DESC,id DESC
)
UPDATE public.ingredients g SET price_before_purchases=g.last_price,manual_price_version=1
FROM latest l WHERE g.store_id=l.store_id AND g.id=l.ingredient_id AND g.manual_price_version=0
  AND g.last_price IS DISTINCT FROM l.unit_price;

CREATE OR REPLACE FUNCTION private.remember_manual_ingredient_price() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  NEW.price_before_purchases := NEW.last_price;
  NEW.manual_price_version := OLD.manual_price_version+1;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.remember_manual_ingredient_price() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS remember_manual_ingredient_price ON public.ingredients;
-- 입고/삭제 트리거에서 계산한 단가는 직접 입력 기록이 아니다. 기존 RPC가 입고 직후
-- 같은 값으로 갱신할 때도 기존 기준가를 유지한다.
CREATE TRIGGER remember_manual_ingredient_price BEFORE UPDATE OF last_price ON public.ingredients
FOR EACH ROW WHEN (pg_trigger_depth()=0 AND OLD.last_price IS DISTINCT FROM NEW.last_price)
EXECUTE FUNCTION private.remember_manual_ingredient_price();

CREATE OR REPLACE FUNCTION private.stamp_purchase_price_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  SELECT g.manual_price_version INTO NEW.manual_price_version FROM public.ingredients g
  WHERE g.store_id=NEW.store_id AND g.id=NEW.ingredient_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PURCHASE_INGREDIENT_STORE_MISMATCH'; END IF;
  -- 같은 재료의 입력 순서가 시계 해상도에 묶이지 않도록 재료 잠금 안에서 정렬한다.
  NEW.created_at := greatest(NEW.created_at,(SELECT i.created_at+interval '1 microsecond'
    FROM public.purchase_items i WHERE i.store_id=NEW.store_id AND i.ingredient_id=NEW.ingredient_id
    ORDER BY i.created_at DESC,i.id DESC LIMIT 1));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.stamp_purchase_price_version() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS stamp_purchase_price_version ON public.purchase_items;
CREATE TRIGGER stamp_purchase_price_version BEFORE INSERT ON public.purchase_items
FOR EACH ROW WHEN (NEW.ingredient_id IS NOT NULL) EXECUTE FUNCTION private.stamp_purchase_price_version();

CREATE OR REPLACE FUNCTION private.apply_purchase_item_price() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.ingredients g SET
      price_before_purchases=CASE WHEN NOT EXISTS (
        SELECT 1 FROM public.purchase_items i WHERE i.store_id=g.store_id
          AND i.ingredient_id=g.id AND i.id<>NEW.id
      ) THEN g.last_price ELSE g.price_before_purchases END,
      last_price=NEW.unit_price
    WHERE g.store_id=NEW.store_id AND g.id=NEW.ingredient_id;
  ELSE
    -- 과거 입고를 수정해도 이후 직접 입력/새 입고의 단가를 덮지 않는다.
    UPDATE public.ingredients g SET last_price=NEW.unit_price,updated_at=now()
    WHERE g.store_id=NEW.store_id AND g.id=NEW.ingredient_id
      AND NEW.manual_price_version=g.manual_price_version
      AND NEW.id=(SELECT i.id FROM public.purchase_items i WHERE i.store_id=g.store_id AND i.ingredient_id=g.id
        ORDER BY i.created_at DESC,i.id DESC LIMIT 1);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.apply_purchase_item_price() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS apply_purchase_item_price ON public.purchase_items;
CREATE TRIGGER apply_purchase_item_price AFTER INSERT OR UPDATE OF unit_price ON public.purchase_items
FOR EACH ROW WHEN (NEW.ingredient_id IS NOT NULL) EXECUTE FUNCTION private.apply_purchase_item_price();

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

-- 분류 관리 화면도 편집 중인 명세를 바꾼다. 대표 분류가 그대로여도 버전을 갱신한다.
CREATE OR REPLACE FUNCTION private.invalidate_purchase_category_edits() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_TABLE_NAME='purchase_items' THEN
    UPDATE public.purchases SET edit_version=edit_version WHERE id=NEW.purchase_id;
  ELSE
    UPDATE public.purchases p SET edit_version=p.edit_version WHERE p.id IN (
      SELECT l.purchase_id FROM public.purchase_amount_lines l WHERE l.category_id=NEW.id
    );
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.invalidate_purchase_category_edits() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS invalidate_amount_category_edit ON public.store_taxonomies;
CREATE TRIGGER invalidate_amount_category_edit AFTER UPDATE OF name ON public.store_taxonomies
FOR EACH ROW WHEN (NEW.domain='purchase' AND OLD.name IS DISTINCT FROM NEW.name)
EXECUTE FUNCTION private.invalidate_purchase_category_edits();
DROP TRIGGER IF EXISTS invalidate_item_category_edit ON public.purchase_items;
CREATE TRIGGER invalidate_item_category_edit AFTER UPDATE OF category,category_id ON public.purchase_items
FOR EACH ROW WHEN (OLD.category_id IS DISTINCT FROM NEW.category_id OR OLD.category IS DISTINCT FROM NEW.category)
EXECUTE FUNCTION private.invalidate_purchase_category_edits();

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
  p_store_id uuid,p_date date,p_supplier text,p_type text,p_mode text,p_rows jsonb,p_purchase_id uuid DEFAULT NULL,p_expected_version bigint DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  row_data jsonb;
  line_amount numeric;
  total numeric := 0;
  category_id_for_line uuid;
  purchase_id_for_rows uuid;
  locked_version bigint;
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
    SELECT p.id,p.edit_version INTO purchase_id_for_rows,locked_version FROM public.purchases p WHERE p.id=p_purchase_id AND p.store_id=p_store_id FOR UPDATE;
    IF NOT FOUND OR p_mode<>'amounts' OR NOT EXISTS (
      SELECT 1 FROM public.purchase_amount_lines WHERE purchase_id=purchase_id_for_rows
    ) THEN RAISE EXCEPTION 'PURCHASE_AMOUNT_ENTRY_NOT_FOUND'; END IF;
    IF locked_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'PURCHASE_CHANGED'; END IF;
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
    END IF;
    INSERT INTO public.purchase_items(purchase_id,store_id,category_id,ingredient_id,name,quantity,unit,unit_price,subtotal)
    VALUES(purchase_id_for_rows,p_store_id,category_id_for_line,ingredient,btrim(row_data->>'name'),quantity_for_line,
           coalesce(unit_for_line,''),price_for_unit,line_amount);
    IF ingredient IS NOT NULL THEN
      UPDATE public.ingredients SET current_stock=current_stock+quantity_for_line,last_price=price_for_unit,updated_at=now()
      WHERE id=ingredient AND store_id=p_store_id;
    END IF;
  END LOOP;
  IF NOT has_rows THEN RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT'; END IF;
  IF p_purchase_id IS NOT NULL THEN
    UPDATE public.purchases SET date=p_date,supplier=btrim(p_supplier),type=p_type WHERE id=purchase_id_for_rows;
  END IF;
  PERFORM private.refresh_purchase_totals(purchase_id_for_rows);
  RETURN purchase_id_for_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.create_purchase_entry(uuid,date,text,text,text,jsonb,uuid,bigint), public.category_amounts(public.purchases) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_entry(uuid,date,text,text,text,jsonb,uuid,bigint), public.category_amounts(public.purchases) TO authenticated;

-- 수량만 바꿀 때는 잠금 후 읽은 소계를 보존한다. 과거 소수 원 소계는 수정 시 원 단위로 반올림한다.
CREATE OR REPLACE FUNCTION private.edit_purchase_item(p_item_id uuid,p_quantity numeric,p_amount numeric,p_expected_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  parent_id uuid;
  locked_version bigint;
  parent_store uuid;
  old_item public.purchase_items%ROWTYPE;
  amount_won numeric;
  price numeric;
BEGIN
  SELECT p.id,p.store_id,p.edit_version INTO parent_id,parent_store,locked_version FROM public.purchases p
  JOIN public.purchase_items i ON i.purchase_id=p.id AND i.store_id=p.store_id
  WHERE i.id=p_item_id AND public.is_store_member(p.store_id) AND public.can_read_store_financials(p.store_id)
  FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINANCIAL_SHARING_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT old_item FROM public.purchase_items WHERE purchase_id=parent_id AND id=p_item_id FOR UPDATE;
  IF locked_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'PURCHASE_CHANGED'; END IF;
  amount_won := coalesce(p_amount,round(old_item.subtotal));
  IF p_quantity IS NULL OR p_quantity<=0 OR p_quantity>=1000000000 OR amount_won<0
     OR amount_won>=1000000000000 OR amount_won<>trunc(amount_won) THEN RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT'; END IF;
  price := amount_won/p_quantity;
  IF price>=1000000000 THEN RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT'; END IF;
  PERFORM 1 FROM public.ingredients g WHERE g.store_id=parent_store AND g.id IN (
    SELECT i.ingredient_id FROM public.purchase_items i WHERE i.purchase_id=parent_id
      AND (i.id=p_item_id OR i.subtotal<>round(i.subtotal))
  ) ORDER BY g.id FOR UPDATE;
  UPDATE public.purchase_items SET quantity=p_quantity,unit_price=price,subtotal=amount_won WHERE id=p_item_id;
  -- 구버전의 소수 원 형제 품목은 이 영수증의 종전 반올림 합계를 보존하도록
  -- 나머지가 큰 행부터 1원씩 배분한다. 정수 원 기록과 다른 영수증은 건드리지 않는다.
  WITH fractions AS (
    SELECT id,floor(subtotal) AS whole,
      row_number() OVER (ORDER BY subtotal-floor(subtotal) DESC,id) AS priority,
      round(old_item.subtotal+sum(subtotal-floor(subtotal)) OVER ())-round(old_item.subtotal) AS extra
    FROM public.purchase_items WHERE purchase_id=parent_id AND id<>p_item_id AND subtotal<>round(subtotal)
  ), normalized AS (
    SELECT id,whole+CASE WHEN priority<=extra THEN 1 ELSE 0 END AS amount FROM fractions
  )
  UPDATE public.purchase_items i SET subtotal=n.amount,unit_price=n.amount/i.quantity
  FROM normalized n WHERE i.id=n.id;
  UPDATE public.ingredients SET current_stock=current_stock+(p_quantity-old_item.quantity),updated_at=now()
  WHERE store_id=parent_store AND id=old_item.ingredient_id;
  PERFORM private.refresh_purchase_totals(parent_id);
END;
$$;

REVOKE ALL ON FUNCTION private.edit_purchase_item(uuid,numeric,numeric,bigint) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.update_purchase_item_amount(p_item_id uuid,p_quantity numeric,p_amount numeric,p_expected_version bigint)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT private.edit_purchase_item(p_item_id,p_quantity,p_amount,p_expected_version);
$$;
-- 버전을 보내지 못하는 구앱이 최신 수량을 덮어쓰지 않도록 기존 엔드포인트는 갱신을 요청한다.
CREATE OR REPLACE FUNCTION public.update_purchase_item(p_item_id uuid,p_quantity numeric,p_unit_price numeric)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'PURCHASE_CHANGED';
END;
$$;
REVOKE ALL ON FUNCTION public.update_purchase_item_amount(uuid,numeric,numeric,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_item_amount(uuid,numeric,numeric,bigint) TO authenticated;
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
    PERFORM 1 FROM public.ingredients WHERE id=received.ingredient_id AND store_id=OLD.store_id FOR UPDATE;
    -- 마지막 입고의 단가를 되돌린다. 이후 별도로 직접 수정한 단가는 보존한다.
    WITH latest AS (
      SELECT i.purchase_id,i.manual_price_version AS receipt_version FROM public.purchase_items i
      WHERE i.store_id=OLD.store_id AND i.ingredient_id=received.ingredient_id
      ORDER BY i.created_at DESC,i.id DESC LIMIT 1
    )
    UPDATE public.ingredients g SET current_stock=current_stock-received.quantity,
      last_price=CASE WHEN EXISTS (SELECT 1 FROM latest WHERE purchase_id=OLD.id
        AND receipt_version=g.manual_price_version)
      THEN coalesce((SELECT i.unit_price FROM public.purchase_items i WHERE i.store_id=OLD.store_id
        AND i.ingredient_id=received.ingredient_id AND i.purchase_id<>OLD.id
        AND i.manual_price_version=g.manual_price_version
        ORDER BY i.created_at DESC,i.id DESC LIMIT 1),price_before_purchases) ELSE last_price END,updated_at=now()
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
