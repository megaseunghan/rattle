-- Read RPCs authorize once before aggregation. Existing table RLS remains unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_pos_daily_summaries(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(date date, date_from timestamptz, date_to timestamptz, total_amount numeric, order_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_close time;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'store access denied' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to OR p_to - p_from > interval '370 days' THEN
    RAISE EXCEPTION 'invalid POS period' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(s.closing_time,'23:00'::time) INTO v_close FROM public.stores s WHERE s.id=p_store_id;
  RETURN QUERY
  WITH grouped AS (
    SELECT ((o.order_at AT TIME ZONE 'Asia/Seoul') - (v_close - '00:00'::time))::date AS day,
      sum(o.total_amount) AS amount, count(*) AS n
    FROM public.toss_orders o WHERE o.store_id=p_store_id AND o.status='COMPLETED'
      AND o.order_at>=p_from AND o.order_at<p_to
    GROUP BY 1
  ) SELECT g.day, (g.day+v_close) AT TIME ZONE 'Asia/Seoul',
    ((g.day+1)+v_close) AT TIME ZONE 'Asia/Seoul', g.amount,g.n FROM grouped g ORDER BY g.day DESC;
END $$;

CREATE OR REPLACE FUNCTION public.get_pos_daily_items(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(item_id text, item_name text, category_name text, quantity numeric, total_amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'store access denied' USING ERRCODE='42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from>=p_to OR p_to-p_from>interval '370 days' THEN
    RAISE EXCEPTION 'invalid POS period' USING ERRCODE='22023';
  END IF;
  RETURN QUERY SELECT coalesce(nullif(i.item_id,''),''), min(i.item_name),
    coalesce(max(c.category_name),''), sum(i.quantity),sum(i.total_price)
  FROM public.toss_orders o JOIN public.toss_order_items i ON i.order_id=o.id AND i.store_id=o.store_id
  LEFT JOIN public.toss_catalog c ON c.store_id=p_store_id AND c.item_id=i.item_id
  WHERE o.store_id=p_store_id AND o.status='COMPLETED' AND o.order_at>=p_from AND o.order_at<p_to
  GROUP BY coalesce(nullif(i.item_id,''),i.item_name), coalesce(nullif(i.item_id,''),'')
  ORDER BY sum(i.total_price) DESC;
END $$;

CREATE OR REPLACE FUNCTION public.upsert_pos_order_batch(p_store_id uuid,p_orders jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o jsonb; i jsonb; v_order_id uuid; n integer:=0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.user_has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'store access denied' USING ERRCODE='42501';
  END IF;
  IF p_orders IS NULL OR jsonb_typeof(p_orders)<>'array' THEN
    RAISE EXCEPTION 'orders must be an array' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_orders)>500 THEN RAISE EXCEPTION 'batch too large' USING ERRCODE='22023'; END IF;
  -- Consistent lock order reduces overlapping sync deadlocks.
  FOR o IN SELECT value FROM jsonb_array_elements(p_orders) ORDER BY value->>'orderId' LOOP
    IF jsonb_typeof(o)<>'object' OR coalesce(o->>'orderId','')='' OR o->>'orderAt' IS NULL
      OR jsonb_typeof(o->'totalAmount') IS DISTINCT FROM 'number'
      OR jsonb_typeof(o->'cardAmount') IS DISTINCT FROM 'number'
      OR jsonb_typeof(o->'cashAmount') IS DISTINCT FROM 'number'
      OR coalesce(o->>'status','') NOT IN ('COMPLETED','CANCELLED','REFUNDED')
      OR jsonb_typeof(o->'items') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'invalid order' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(o->'items')>1000 THEN RAISE EXCEPTION 'too many items' USING ERRCODE='22023'; END IF;
    v_order_id:=NULL;
    INSERT INTO public.toss_orders AS existing(store_id,toss_order_id,order_at,total_amount,status,card_amount,cash_amount)
    VALUES(p_store_id,o->>'orderId',(o->>'orderAt')::timestamptz,(o->>'totalAmount')::numeric,o->>'status',
      (o->>'cardAmount')::numeric,(o->>'cashAmount')::numeric)
    ON CONFLICT(toss_order_id) DO UPDATE SET order_at=excluded.order_at,total_amount=excluded.total_amount,
      status=excluded.status,card_amount=excluded.card_amount,cash_amount=excluded.cash_amount
      WHERE existing.store_id=p_store_id
    RETURNING id INTO v_order_id;
    IF v_order_id IS NULL THEN RAISE EXCEPTION 'order belongs to another store' USING ERRCODE='42501'; END IF;
    DELETE FROM public.toss_order_items d WHERE d.order_id=v_order_id;
    FOR i IN SELECT value FROM jsonb_array_elements(o->'items') LOOP
      IF jsonb_typeof(i)<>'object' OR coalesce(i->>'itemName','')=''
        OR jsonb_typeof(i->'quantity') IS DISTINCT FROM 'number'
        OR jsonb_typeof(i->'unitPrice') IS DISTINCT FROM 'number'
        OR jsonb_typeof(i->'totalPrice') IS DISTINCT FROM 'number'
        OR (i ? 'optionChoices' AND jsonb_typeof(i->'optionChoices')<>'array') THEN
        RAISE EXCEPTION 'invalid item' USING ERRCODE='22023';
      END IF;
      INSERT INTO public.toss_order_items(order_id,store_id,item_id,item_name,category_name,quantity,unit_price,total_price,option_choices)
      VALUES(v_order_id,p_store_id,i->>'itemId',i->>'itemName',coalesce(i->>'categoryName',''),
        (i->>'quantity')::numeric,(i->>'unitPrice')::numeric,(i->>'totalPrice')::numeric,coalesce(i->'optionChoices','[]'::jsonb));
    END LOOP;
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.get_pos_daily_summaries(uuid,timestamptz,timestamptz),
  public.get_pos_daily_items(uuid,timestamptz,timestamptz), public.upsert_pos_order_batch(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_pos_daily_summaries(uuid,timestamptz,timestamptz),
  public.get_pos_daily_items(uuid,timestamptz,timestamptz), public.upsert_pos_order_batch(uuid,jsonb) TO authenticated;
COMMIT;
