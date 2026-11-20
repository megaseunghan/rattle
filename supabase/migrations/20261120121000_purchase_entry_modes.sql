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
DECLARE fallback uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.store_taxonomies WHERE id=NEW.id AND NOT is_active)
     OR NOT EXISTS (SELECT 1 FROM public.purchase_amount_lines WHERE category_id=NEW.id) THEN RETURN NULL; END IF;
  fallback := public.resolve_store_taxonomy(NEW.store_id,'purchase','기타');
  WITH moved AS (
    DELETE FROM public.purchase_amount_lines WHERE category_id=NEW.id RETURNING purchase_id,amount
  )
  INSERT INTO public.purchase_amount_lines AS existing(purchase_id,category_id,amount)
  SELECT purchase_id,fallback,amount FROM moved
  ON CONFLICT(purchase_id,category_id) DO UPDATE SET amount=existing.amount+excluded.amount;
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
  header_category uuid;
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

    header_category := coalesce(header_category,category_id_for_line);
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
  IF header_category IS NULL THEN RAISE EXCEPTION 'PURCHASE_INVALID_AMOUNT'; END IF;
  IF p_purchase_id IS NULL THEN
    UPDATE public.purchases SET amount=total WHERE id=purchase_id_for_rows;
  ELSE
    UPDATE public.purchases SET date=p_date,supplier=btrim(p_supplier),type=p_type,category_id=header_category,
      category=(SELECT name FROM public.store_taxonomies WHERE id=header_category),amount=total WHERE id=purchase_id_for_rows;
  END IF;
  RETURN purchase_id_for_rows;
END;
$$;
REVOKE ALL ON FUNCTION public.create_purchase_entry(uuid,date,text,text,text,jsonb,uuid), public.category_amounts(public.purchases) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_entry(uuid,date,text,text,text,jsonb,uuid), public.category_amounts(public.purchases) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
