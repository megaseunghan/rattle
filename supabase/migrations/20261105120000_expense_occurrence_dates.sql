BEGIN;
-- No backfill: creation timestamp is not evidence of occurrence.
ALTER TABLE public.expenses ADD COLUMN occurred_on date;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_occurrence_month
  CHECK (occurred_on IS NULL OR year_month = to_char(occurred_on, 'YYYY-MM')) NOT VALID;
ALTER TABLE public.expenses VALIDATE CONSTRAINT expenses_occurrence_month;
CREATE INDEX expenses_store_occurrence ON public.expenses(store_id, occurred_on);

CREATE FUNCTION public.validate_expense_occurrence() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN RAISE EXCEPTION 'EXPENSE_STORE_IMMUTABLE'; END IF;
    IF OLD.occurred_on IS NOT NULL AND NEW.occurred_on IS NULL THEN RAISE EXCEPTION 'EXPENSE_DATE_REQUIRED'; END IF;
    IF OLD.occurred_on IS NULL AND NEW.occurred_on IS NULL AND NEW.year_month IS DISTINCT FROM OLD.year_month THEN
      RAISE EXCEPTION 'EXPENSE_DATE_REQUIRED';
    END IF;
  END IF;
  -- Older installed clients still submit monthly rows. Preserve as undated legacy; never invent a date.
  -- The new date-aware app validates its required occurrence date before writing.
  IF NEW.occurred_on IS NULL AND (NEW.year_month IS NULL OR NEW.year_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' OR left(NEW.year_month,4)='0000') THEN RAISE EXCEPTION 'INVALID_YEAR_MONTH'; END IF;
  IF NEW.occurred_on IS NOT NULL THEN
    IF NOT isfinite(NEW.occurred_on) OR NEW.occurred_on < DATE '0001-01-01' OR NEW.occurred_on > DATE '9999-12-31' THEN
      RAISE EXCEPTION 'EXPENSE_DATE_INVALID';
    END IF;
    NEW.year_month := to_char(NEW.occurred_on, 'YYYY-MM');
  END IF;
  IF NEW.category NOT IN ('고정비','마케팅','시설보수','공과금') OR NEW.category IS NULL
    OR NEW.name IS NULL OR btrim(NEW.name)='' OR NEW.amount IS NULL OR NEW.amount <= 0
    OR NEW.amount::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION 'EXPENSE_INPUT_INVALID';
  END IF;
  IF NEW.category='고정비' THEN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.store_id::text, 305)); END IF;
  -- Existing RLS remains authoritative for variable writes; fixed writes require admin on server too.
  IF NEW.category='고정비' AND NOT public.is_store_admin(NEW.store_id) THEN RAISE EXCEPTION 'FINANCE_ADMIN_REQUIRED'; END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.category='고정비' AND NOT public.is_store_admin(OLD.store_id) THEN RAISE EXCEPTION 'FINANCE_ADMIN_REQUIRED'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expenses_validate_occurrence BEFORE INSERT OR UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.validate_expense_occurrence();

-- Admin-only, one statement/snapshot for monthly total, carry and daily coverage.
CREATE FUNCTION public.get_daily_expense_series(p_store_id uuid, p_year_month text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.assert_store_finance_access(p_store_id);
  IF p_year_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' OR left(p_year_month,4)='0000' OR p_year_month IS NULL THEN
    RAISE EXCEPTION 'INVALID_YEAR_MONTH';
  END IF;
  WITH fixed_month AS (
    SELECT max(year_month) ym FROM public.expenses WHERE store_id=p_store_id AND category='고정비' AND year_month<=p_year_month
  ), effective AS (
    SELECT e.*, e.year_month<>p_year_month AS carried FROM public.expenses e
    WHERE e.store_id=p_store_id AND ((e.category='고정비' AND e.year_month=(SELECT ym FROM fixed_month))
      OR (e.category IN ('마케팅','시설보수','공과금') AND e.year_month=p_year_month))
  ), totals AS (
    SELECT coalesce(sum(amount),0) monthly_total,
      coalesce(sum(amount) FILTER (WHERE occurred_on IS NULL OR carried),0) unallocated_amount,
      count(*) FILTER (WHERE occurred_on IS NULL OR carried) unallocated_count,
      coalesce(sum(amount) FILTER (WHERE carried),0) carried_fixed_amount
    FROM effective
  ), days AS (
    SELECT d::date date, coalesce(sum(e.amount),0) known_amount FROM
      generate_series((p_year_month||'-01')::date, ((p_year_month||'-01')::date + interval '1 month - 1 day')::date, interval '1 day') d
      LEFT JOIN effective e ON NOT e.carried AND e.occurred_on=d::date GROUP BY d
  ), cumulative AS (SELECT *, sum(known_amount) OVER (ORDER BY date) known_cumulative_amount FROM days)
  SELECT jsonb_build_object('yearMonth',p_year_month,'monthlyTotal',t.monthly_total,
    'unallocatedAmount',t.unallocated_amount,'unallocatedCount',t.unallocated_count,'carriedFixedAmount',t.carried_fixed_amount,
    'availability',CASE WHEN t.unallocated_count=0 THEN 'complete' ELSE 'partial' END,
    'days',(SELECT jsonb_agg(jsonb_build_object('date',date,'knownAmount',known_amount,
      'amount',CASE WHEN t.unallocated_count=0 THEN known_amount ELSE NULL END,
      'knownCumulativeAmount',known_cumulative_amount,
      'cumulativeAmount',CASE WHEN t.unallocated_count=0 THEN known_cumulative_amount ELSE NULL END) ORDER BY date) FROM cumulative)) INTO result FROM totals t;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_daily_expense_series(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_daily_expense_series(uuid,text) TO authenticated;
-- Explicit whole-set copy prevents partial fixed overrides and partial Promise.all success.
CREATE FUNCTION public.copy_fixed_expenses_with_dates(p_store_id uuid, p_year_month text, p_dates jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE source_month text; source_count integer;
BEGIN
  PERFORM public.assert_store_finance_access(p_store_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text,305));
  IF p_year_month IS NULL OR p_year_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' OR left(p_year_month,4)='0000' THEN RAISE EXCEPTION 'INVALID_YEAR_MONTH'; END IF;
  IF EXISTS(SELECT 1 FROM expenses WHERE store_id=p_store_id AND category='고정비' AND year_month=p_year_month) THEN RAISE EXCEPTION 'FIXED_EXPENSES_ALREADY_EXIST'; END IF;
  SELECT max(year_month) INTO source_month FROM expenses WHERE store_id=p_store_id AND category='고정비' AND year_month<p_year_month;
  -- Lock source rows against concurrent edits/deletion before snapshot copy.
  PERFORM 1 FROM expenses WHERE store_id=p_store_id AND category='고정비' AND year_month=source_month ORDER BY id FOR UPDATE;
  SELECT count(*) INTO source_count FROM expenses WHERE store_id=p_store_id AND category='고정비' AND year_month=source_month;
  IF source_count=0 OR jsonb_typeof(p_dates) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'FIXED_COPY_INVALID'; END IF;
  IF jsonb_array_length(p_dates)<>source_count OR
    (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_dates) x)<>source_count OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(p_dates) x WHERE NOT EXISTS(
      SELECT 1 FROM expenses e WHERE e.id::text=x->>'id' AND e.store_id=p_store_id AND e.category='고정비' AND e.year_month=source_month)
      OR x->>'occurred_on' IS NULL OR x->>'occurred_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      OR to_char((x->>'occurred_on')::date,'YYYY-MM')<>p_year_month) THEN RAISE EXCEPTION 'FIXED_COPY_INVALID'; END IF;
  INSERT INTO expenses(store_id,year_month,category,name,amount,occurred_on)
    SELECT p_store_id,p_year_month,e.category,e.name,e.amount,(x->>'occurred_on')::date
    FROM jsonb_array_elements(p_dates) x JOIN expenses e ON e.id::text=x->>'id' AND e.store_id=p_store_id;
END $$;
REVOKE ALL ON FUNCTION public.copy_fixed_expenses_with_dates(uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.copy_fixed_expenses_with_dates(uuid,text,jsonb) TO authenticated;
COMMIT;
