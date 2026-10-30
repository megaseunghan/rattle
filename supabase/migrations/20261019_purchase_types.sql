BEGIN;
ALTER TABLE public.stores ADD COLUMN purchase_types text[] NOT NULL DEFAULT ARRAY['쿠팡','네이버','수기'];
-- 기존 전자세금계산서 등 이력에 쓰인 유형도 목록에 보존한다.
UPDATE public.stores s SET purchase_types = ARRAY(
  SELECT DISTINCT name FROM unnest(s.purchase_types || ARRAY(SELECT DISTINCT p.type FROM public.purchases p WHERE p.store_id = s.id)) name ORDER BY name
);
ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_type_check;
ALTER TABLE public.purchases ADD CONSTRAINT purchases_type_check CHECK (length(btrim(type)) BETWEEN 1 AND 40);

CREATE FUNCTION public.change_purchase_type(p_store_id uuid, p_old_name text, p_new_name text)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE names text[]; new_name text := btrim(p_new_name);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_store_admin(p_store_id) THEN RAISE EXCEPTION '매입 유형은 관리자만 변경할 수 있습니다'; END IF;
  IF new_name IS NULL OR length(new_name) NOT BETWEEN 1 AND 40 OR new_name = '전체' THEN RAISE EXCEPTION '유형은 1~40자로 입력해주세요'; END IF;
  SELECT purchase_types INTO names FROM public.stores WHERE id = p_store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION '매장을 찾을 수 없습니다'; END IF;
  IF p_old_name = new_name THEN RETURN names; END IF;
  IF new_name = ANY(names) THEN RAISE EXCEPTION '이미 등록된 유형입니다'; END IF;
  IF p_old_name IS NULL THEN
    names := array_append(names, new_name);
  ELSE
    IF NOT p_old_name = ANY(names) THEN RAISE EXCEPTION '유형이 변경됐습니다. 새로고침해주세요'; END IF;
    names := array_replace(names, p_old_name, new_name);

  END IF;
  UPDATE public.stores SET purchase_types = names WHERE id = p_store_id;
  IF p_old_name IS NOT NULL THEN UPDATE public.purchases SET type = new_name WHERE store_id = p_store_id AND type = p_old_name; END IF;
  RETURN names;
END;
$$;
REVOKE ALL ON FUNCTION public.change_purchase_type(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_purchase_type(uuid,text,text) TO authenticated;
CREATE FUNCTION public.validate_purchase_type() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE names text[];
BEGIN
  SELECT purchase_types INTO names FROM public.stores WHERE id = NEW.store_id FOR SHARE;
  IF NOT coalesce(NEW.type = ANY(names), false) THEN RAISE EXCEPTION '매입 유형이 변경됐습니다. 새로고침 후 다시 선택해주세요'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validate_purchase_type BEFORE INSERT OR UPDATE OF type, store_id ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.validate_purchase_type();
COMMIT;
