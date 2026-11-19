-- Skip unchanged POS masters/details, preserving the processed-order return count.
-- 선행: 20261023121000_pos_read_models.sql, 20261023123000_store_setup_financial_sharing.sql.
-- Apply after existing migrations. No backfill, table/index/RLS or legacy RPC changes.
-- Recovery: in a NEW forward migration restore the previous function definition
-- including the financial-sharing guard; preserve its owner/ACL. Never drop tables.
-- CREATE OR REPLACE preserves existing ownership/ACL; deliberately no new grants.
BEGIN;
CREATE OR REPLACE FUNCTION public.upsert_pos_order_batch(p_store_id uuid,p_orders jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o jsonb; i jsonb; v_order_id uuid; n integer:=0;
  v_incoming jsonb; v_existing jsonb;
BEGIN
  -- Preserve the guard injected by 20261023123000_store_setup_financial_sharing.sql.
  IF NOT public.can_read_store_financials(p_store_id) THEN
    RAISE EXCEPTION 'FINANCIAL_SHARING_DENIED' USING ERRCODE='42501';
  END IF;
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
      WHERE existing.store_id=p_store_id AND
        ROW(existing.order_at,existing.total_amount,existing.status,existing.card_amount,existing.cash_amount)
        IS DISTINCT FROM ROW(excluded.order_at,excluded.total_amount,excluded.status,excluded.card_amount,excluded.cash_amount)
    RETURNING id INTO v_order_id;
    -- ON CONFLICT locks even an unchanged row but does not RETURN it. Resolve its
    -- ID separately, without manufacturing an UPDATE; keep the lock through items.
    IF v_order_id IS NULL THEN
      SELECT id INTO v_order_id FROM public.toss_orders
        WHERE toss_order_id=o->>'orderId' AND store_id=p_store_id FOR UPDATE;
    END IF;
    IF v_order_id IS NULL THEN RAISE EXCEPTION 'order belongs to another store' USING ERRCODE='42501'; END IF;
    v_incoming:='[]'::jsonb;
    FOR i IN SELECT value FROM jsonb_array_elements(o->'items') LOOP
      IF jsonb_typeof(i)<>'object' OR coalesce(i->>'itemName','')=''
        OR jsonb_typeof(i->'quantity') IS DISTINCT FROM 'number'
        OR jsonb_typeof(i->'unitPrice') IS DISTINCT FROM 'number'
        OR jsonb_typeof(i->'totalPrice') IS DISTINCT FROM 'number'
        OR (i ? 'optionChoices' AND jsonb_typeof(i->'optionChoices')<>'array') THEN
        RAISE EXCEPTION 'invalid item' USING ERRCODE='22023';
      END IF;
      -- Compare typed persisted values, including defaults, without item IDs or
      -- input order. Duplicate line counts and option-array order remain meaningful.
      v_incoming:=v_incoming || jsonb_build_array(jsonb_build_object(
        'store_id',p_store_id,'item_id',i->>'itemId','item_name',i->>'itemName',
        'category_name',coalesce(i->>'categoryName',''), 'quantity',(i->>'quantity')::numeric,
        'unit_price',(i->>'unitPrice')::numeric,'total_price',(i->>'totalPrice')::numeric,
        'option_choices',coalesce(i->'optionChoices','[]'::jsonb)));
    END LOOP;
    SELECT coalesce(jsonb_agg(value ORDER BY value),'[]'::jsonb) INTO v_incoming
      FROM jsonb_array_elements(v_incoming);
    SELECT coalesce(jsonb_agg(line ORDER BY line),'[]'::jsonb) INTO v_existing
      FROM (SELECT jsonb_build_object('store_id',d.store_id,'item_id',d.item_id,
        'item_name',d.item_name,'category_name',d.category_name,'quantity',d.quantity,
        'unit_price',d.unit_price,'total_price',d.total_price,'option_choices',d.option_choices) AS line
        FROM public.toss_order_items d WHERE d.order_id=v_order_id) persisted;
    IF v_existing IS DISTINCT FROM v_incoming THEN
      DELETE FROM public.toss_order_items d WHERE d.order_id=v_order_id;
      INSERT INTO public.toss_order_items(order_id,store_id,item_id,item_name,category_name,quantity,unit_price,total_price,option_choices)
      SELECT v_order_id,p_store_id,x.item_id,x.item_name,x.category_name,x.quantity,x.unit_price,x.total_price,x.option_choices
      FROM jsonb_to_recordset(v_incoming) AS x(store_id uuid,item_id text,item_name text,category_name text,
        quantity numeric,unit_price numeric,total_price numeric,option_choices jsonb);
    END IF;
    n:=n+1;
  END LOOP;
  RETURN n;
END $$;
COMMIT;
