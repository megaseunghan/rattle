BEGIN;

-- A sole owner can remove a store only while it has no operational records or POS link.
-- The store row is locked while checking references so a concurrent FK insert cannot
-- slip between the checks and deletion. Store taxonomies are setup data created with
-- a new store; the owner's own membership is removed by the store FK cascade.
CREATE OR REPLACE FUNCTION public.delete_empty_owned_store(p_store_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  caller_id uuid := auth.uid();
  merchant_id text;
  ref record;
  has_rows boolean;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'STORE_DELETE_AUTH_REQUIRED'; END IF;

  SELECT toss_merchant_id INTO merchant_id
  FROM public.stores WHERE id = p_store_id AND owner_id = caller_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'STORE_DELETE_OWNER_REQUIRED'; END IF;
  IF merchant_id IS NOT NULL THEN RAISE EXCEPTION 'STORE_DELETE_POS_CONNECTED'; END IF;

  IF EXISTS (SELECT 1 FROM public.store_members
             WHERE store_id = p_store_id AND user_id <> caller_id) THEN
    RAISE EXCEPTION 'STORE_DELETE_HAS_MEMBERS';
  END IF;

  -- Check every direct FK to stores, including future tables. Never silently
  -- cascade operational records merely because a new table was added later.
  FOR ref IN
    SELECT c.conrelid, n.nspname, t.relname, a.attname,
           array_length(c.conkey, 1) AS column_count
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.stores'::regclass
  LOOP
    IF ref.conrelid IN ('public.store_members'::regclass,
                       'public.store_taxonomies'::regclass) THEN CONTINUE; END IF;
    IF ref.attname IS NULL OR ref.column_count <> 1 THEN
      RAISE EXCEPTION 'STORE_DELETE_UNCHECKED_REFERENCE';
    END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I.%I WHERE %I = $1)',
                   ref.nspname, ref.relname, ref.attname)
      INTO has_rows USING p_store_id;
    IF has_rows THEN RAISE EXCEPTION 'STORE_DELETE_HAS_DATA'; END IF;
  END LOOP;

  DELETE FROM public.stores WHERE id = p_store_id AND owner_id = caller_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'STORE_DELETE_OWNER_REQUIRED'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_empty_owned_store(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_empty_owned_store(uuid) TO authenticated;

COMMIT;
