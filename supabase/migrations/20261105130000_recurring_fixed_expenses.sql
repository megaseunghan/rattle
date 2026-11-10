BEGIN;

-- Monthly occurrence keys are derived from immutable versions. Reads never insert
-- expense rows, so a restart, parallel reader or refresh cannot duplicate costs.
CREATE TABLE public.recurring_fixed_expenses (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  source_expense_id uuid UNIQUE REFERENCES public.expenses(id) ON DELETE RESTRICT,
  latest_revision integer NOT NULL DEFAULT 1 CHECK (latest_revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid()
);
CREATE TABLE public.recurring_fixed_expense_versions (
  rule_id uuid NOT NULL REFERENCES public.recurring_fixed_expenses(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  effective_month text NOT NULL CHECK (effective_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left(effective_month,4)<>'0000'),
  name text NOT NULL CHECK (btrim(name)<>''),
  amount numeric NOT NULL CHECK (amount>0 AND amount::text NOT IN ('NaN','Infinity','-Infinity')),
  payment_day integer NOT NULL CHECK (payment_day BETWEEN 1 AND 31),
  active boolean NOT NULL,
  end_month text CHECK (end_month IS NULL OR (end_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$' AND left(end_month,4)<>'0000' AND end_month>=effective_month)),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  PRIMARY KEY(rule_id,revision)
);
CREATE INDEX recurring_fixed_expenses_store ON public.recurring_fixed_expenses(store_id);
CREATE INDEX recurring_fixed_expense_versions_month ON public.recurring_fixed_expense_versions(rule_id,effective_month DESC,revision DESC);
ALTER TABLE public.recurring_fixed_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_fixed_expense_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY recurring_fixed_expenses_admin_read ON public.recurring_fixed_expenses FOR SELECT TO authenticated
  USING (public.is_store_admin(store_id));
CREATE POLICY recurring_fixed_versions_admin_read ON public.recurring_fixed_expense_versions FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.recurring_fixed_expenses r WHERE r.id=rule_id AND public.is_store_admin(r.store_id)));
REVOKE ALL ON public.recurring_fixed_expenses,public.recurring_fixed_expense_versions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.recurring_fixed_expenses,public.recurring_fixed_expense_versions TO authenticated;

-- A linked original remains in its original month. Same-month date backfill and
-- explicit name/amount corrections remain possible; schedules retain their own versions.
CREATE FUNCTION public.protect_recurring_expense_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM public.recurring_fixed_expenses r WHERE r.source_expense_id=OLD.id) THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RECURRING_EXPENSE_SOURCE_LOCKED'; END IF;
    IF NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.category IS DISTINCT FROM OLD.category
      OR coalesce(to_char(NEW.occurred_on,'YYYY-MM'),NEW.year_month) IS DISTINCT FROM OLD.year_month THEN
      RAISE EXCEPTION 'RECURRING_EXPENSE_SOURCE_LOCKED';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_recurring_expense_source() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER recurring_expense_source_guard BEFORE UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.protect_recurring_expense_source();

CREATE FUNCTION public.validate_recurring_expense_month(p_month text) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
BEGIN
  IF p_month IS NULL OR p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' OR left(p_month,4)='0000' THEN RAISE EXCEPTION 'INVALID_YEAR_MONTH'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.validate_recurring_expense_month(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validate_recurring_expense_month(text) TO authenticated;

CREATE FUNCTION public.save_recurring_fixed_expense(
  p_rule_id uuid,p_store_id uuid,p_effective_month text,p_name text,p_amount numeric,
  p_payment_day integer,p_active boolean,p_end_month text DEFAULT NULL,
  p_source_expense_id uuid DEFAULT NULL,p_expected_revision integer DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.recurring_fixed_expenses%ROWTYPE; v public.recurring_fixed_expense_versions%ROWTYPE;
  this_month text := to_char(timezone('Asia/Seoul',now()),'YYYY-MM');
  next_month text := to_char(date_trunc('month',timezone('Asia/Seoul',now()))+interval '1 month','YYYY-MM');
  source_month text;
BEGIN
  PERFORM public.assert_store_finance_access(p_store_id);
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'FINANCE_ADMIN_REQUIRED'; END IF;
  PERFORM public.validate_recurring_expense_month(p_effective_month);
  IF p_end_month IS NOT NULL THEN PERFORM public.validate_recurring_expense_month(p_end_month); END IF;
  IF p_rule_id IS NULL OR p_name IS NULL OR btrim(p_name)='' OR p_amount IS NULL OR p_amount<=0
    OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_payment_day IS NULL OR p_payment_day NOT BETWEEN 1 AND 31
    OR p_active IS NULL OR (p_end_month IS NOT NULL AND p_end_month<p_effective_month) THEN RAISE EXCEPTION 'RECURRING_EXPENSE_INVALID'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text,305));
  SELECT * INTO r FROM public.recurring_fixed_expenses WHERE id=p_rule_id FOR UPDATE;
  IF FOUND THEN
    IF r.store_id<>p_store_id OR r.source_expense_id IS DISTINCT FROM p_source_expense_id THEN RAISE EXCEPTION 'RECURRING_EXPENSE_IDENTITY_CHANGED'; END IF;
    IF p_source_expense_id IS NOT NULL THEN
      SELECT e.year_month INTO source_month FROM public.expenses e WHERE e.id=p_source_expense_id AND e.store_id=p_store_id AND e.category='고정비' FOR UPDATE;
      IF NOT FOUND OR source_month>=p_effective_month THEN RAISE EXCEPTION 'RECURRING_EXPENSE_SOURCE_INVALID'; END IF;
    END IF;
    -- An identical request after a lost response is a no-op, even when another
    -- admin subsequently appended a later version. It never reinstates old data.
    SELECT * INTO v FROM public.recurring_fixed_expense_versions x WHERE x.rule_id=p_rule_id
      AND x.effective_month=p_effective_month AND x.name=btrim(p_name) AND x.amount=p_amount
      AND x.payment_day=p_payment_day AND x.active=p_active AND x.end_month IS NOT DISTINCT FROM p_end_month
      AND ((x.revision=1 AND p_expected_revision IS NULL) OR x.revision=p_expected_revision+1)
      ORDER BY x.revision DESC LIMIT 1;
    IF FOUND THEN RETURN p_rule_id; END IF;
    IF p_expected_revision IS DISTINCT FROM r.latest_revision THEN RAISE EXCEPTION 'RECURRING_EXPENSE_VERSION_CONFLICT'; END IF;
    IF p_effective_month<next_month THEN RAISE EXCEPTION 'RECURRING_EXPENSE_FUTURE_CHANGE_REQUIRED'; END IF;
    UPDATE public.recurring_fixed_expenses SET latest_revision=latest_revision+1 WHERE id=p_rule_id RETURNING * INTO r;
  ELSE
    IF p_expected_revision IS NOT NULL THEN RAISE EXCEPTION 'RECURRING_EXPENSE_VERSION_CONFLICT'; END IF;
    IF p_effective_month<this_month THEN RAISE EXCEPTION 'RECURRING_EXPENSE_NO_BACKDATE'; END IF;
    IF p_source_expense_id IS NOT NULL THEN
      IF EXISTS(SELECT 1 FROM public.recurring_fixed_expenses x WHERE x.source_expense_id=p_source_expense_id) THEN RAISE EXCEPTION 'RECURRING_EXPENSE_SOURCE_CONFLICT'; END IF;
      SELECT e.year_month INTO source_month FROM public.expenses e
        WHERE e.id=p_source_expense_id AND e.store_id=p_store_id AND e.category='고정비' FOR UPDATE;
      IF NOT FOUND OR source_month>=p_effective_month THEN RAISE EXCEPTION 'RECURRING_EXPENSE_SOURCE_INVALID'; END IF;
    END IF;
    INSERT INTO public.recurring_fixed_expenses(id,store_id,source_expense_id) VALUES(p_rule_id,p_store_id,p_source_expense_id) RETURNING * INTO r;
  END IF;
  INSERT INTO public.recurring_fixed_expense_versions(rule_id,revision,effective_month,name,amount,payment_day,active,end_month)
    VALUES(p_rule_id,r.latest_revision,p_effective_month,btrim(p_name),p_amount,p_payment_day,p_active,p_end_month);
  RETURN p_rule_id;
END $$;
REVOKE ALL ON FUNCTION public.save_recurring_fixed_expense(uuid,uuid,text,text,numeric,integer,boolean,text,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_recurring_fixed_expense(uuid,uuid,text,text,numeric,integer,boolean,text,uuid,integer) TO authenticated;

CREATE FUNCTION public.get_recurring_fixed_expenses(p_store_id uuid,p_year_month text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; month_start date; month_days integer; today_kst date:=timezone('Asia/Seoul',now())::date;
BEGIN
  PERFORM public.assert_store_finance_access(p_store_id);
  PERFORM public.validate_recurring_expense_month(p_year_month);
  month_start := (p_year_month||'-01')::date;
  month_days := extract(day FROM month_start+interval '1 month - 1 day');
  WITH rules AS (
    SELECT r.*, (SELECT min(v.effective_month) FROM recurring_fixed_expense_versions v WHERE v.rule_id=r.id) start_month,
      (SELECT to_jsonb(v) FROM recurring_fixed_expense_versions v WHERE v.rule_id=r.id ORDER BY v.revision DESC LIMIT 1) latest,
      (SELECT to_jsonb(v) FROM recurring_fixed_expense_versions v WHERE v.rule_id=r.id AND v.effective_month<=p_year_month
        ORDER BY v.revision DESC LIMIT 1) current
    FROM recurring_fixed_expenses r WHERE r.store_id=p_store_id
  ), projected AS (
    SELECT r.*, month_start+(least((r.current->>'payment_day')::integer,month_days)-1) occurred_on
    FROM rules r WHERE (r.current->>'active')::boolean
      AND (r.current->>'end_month' IS NULL OR r.current->>'end_month'>=p_year_month)
  ) SELECT jsonb_build_object(
    'rules',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'source_expense_id',source_expense_id,'latest_revision',latest_revision,'latest',latest,'current',current) ORDER BY created_at,id) FROM rules),'[]'::jsonb),
    'adoptedSourceIds',coalesce((SELECT jsonb_agg(source_expense_id ORDER BY source_expense_id) FROM rules WHERE source_expense_id IS NOT NULL AND start_month<=p_year_month),'[]'::jsonb),
    'occurrences',coalesce((SELECT jsonb_agg(jsonb_build_object('id','recurring:'||id::text||':'||p_year_month,'rule_id',id,'year_month',p_year_month,
      'name',current->>'name','amount',(current->>'amount')::numeric,'payment_day',(current->>'payment_day')::integer,'occurred_on',occurred_on,
      'status',CASE WHEN occurred_on>today_kst THEN 'scheduled' ELSE 'due' END) ORDER BY occurred_on NULLS LAST,id) FROM projected),'[]'::jsonb)
  ) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_recurring_fixed_expenses(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_recurring_fixed_expenses(uuid,text) TO authenticated;

CREATE FUNCTION public.get_effective_expense_rows(p_store_id uuid,p_year_month text)
RETURNS TABLE(id text,category text,name text,amount numeric,occurred_on date,original_year_month text,origin text,recurring_rule_id uuid,schedule_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE recurring jsonb;
BEGIN
  PERFORM public.assert_store_finance_access(p_store_id);
  PERFORM public.validate_recurring_expense_month(p_year_month);
  recurring:=public.get_recurring_fixed_expenses(p_store_id,p_year_month);
  RETURN QUERY WITH fixed_month AS (
    SELECT max(e.year_month) ym FROM public.expenses e WHERE e.store_id=p_store_id AND e.category='고정비' AND e.year_month<=p_year_month
  ) SELECT e.id::text,e.category::text,e.name::text,e.amount::numeric,
      CASE WHEN e.year_month<>p_year_month THEN NULL::date ELSE e.occurred_on END,
      e.year_month::text,CASE WHEN e.year_month<>p_year_month THEN 'carry' ELSE 'manual' END,NULL::uuid,
      CASE WHEN e.year_month<>p_year_month OR e.occurred_on IS NULL THEN 'unknown'
        WHEN e.occurred_on>timezone('Asia/Seoul',now())::date THEN 'scheduled' ELSE 'due' END
    FROM public.expenses e WHERE e.store_id=p_store_id AND (
      (e.category='고정비' AND e.year_month=(SELECT ym FROM fixed_month)
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(recurring->'adoptedSourceIds') a WHERE a.value=e.id::text))
      OR (e.category IN ('마케팅','시설보수','공과금') AND e.year_month=p_year_month))
    UNION ALL
    SELECT o->>'id','고정비',o->>'name',(o->>'amount')::numeric,(o->>'occurred_on')::date,
      p_year_month,'recurring',(o->>'rule_id')::uuid,o->>'status'
    FROM jsonb_array_elements(recurring->'occurrences') o;
END $$;
REVOKE ALL ON FUNCTION public.get_effective_expense_rows(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_effective_expense_rows(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_daily_expense_series(p_store_id uuid,p_year_month text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.assert_store_finance_access(p_store_id);
  PERFORM public.validate_recurring_expense_month(p_year_month);
  WITH effective AS MATERIALIZED (SELECT * FROM public.get_effective_expense_rows(p_store_id,p_year_month)), totals AS (
    SELECT coalesce(sum(amount),0) monthly_total,
      coalesce(sum(amount) FILTER(WHERE occurred_on IS NULL),0) unallocated_amount,
      count(*) FILTER(WHERE occurred_on IS NULL) unallocated_count,
      coalesce(sum(amount) FILTER(WHERE origin='carry'),0) carried_fixed_amount,
      coalesce(sum(amount) FILTER(WHERE origin='recurring'),0) recurring_total,
      coalesce(sum(amount) FILTER(WHERE schedule_status='scheduled'),0) scheduled_total,
      count(*) FILTER(WHERE schedule_status='policy_pending') policy_pending_count,
      coalesce(sum(amount) FILTER(WHERE occurred_on<=timezone('Asia/Seoul',now())::date),0) incurred_known_total
    FROM effective
  ), days AS (
    SELECT d::date date,coalesce(sum(e.amount),0) known_amount FROM
      generate_series((p_year_month||'-01')::date,((p_year_month||'-01')::date+interval '1 month - 1 day')::date,interval '1 day') d
      LEFT JOIN effective e ON e.occurred_on=d::date GROUP BY d
  ), cumulative AS (SELECT *,sum(known_amount) OVER(ORDER BY date) known_cumulative_amount FROM days)
  SELECT jsonb_build_object('yearMonth',p_year_month,'monthlyTotal',t.monthly_total,'unallocatedAmount',t.unallocated_amount,
    'unallocatedCount',t.unallocated_count,'carriedFixedAmount',t.carried_fixed_amount,'recurringTotal',t.recurring_total,
    'scheduledTotal',t.scheduled_total,'policyPendingCount',t.policy_pending_count,'incurredKnownTotal',t.incurred_known_total,
    'availability',CASE WHEN t.unallocated_count=0 THEN 'complete' ELSE 'partial' END,
    'occurrences',public.get_recurring_fixed_expenses(p_store_id,p_year_month)->'occurrences',
    'days',(SELECT jsonb_agg(jsonb_build_object('date',date,'knownAmount',known_amount,
      'amount',CASE WHEN t.unallocated_count=0 THEN known_amount ELSE NULL END,
      'knownCumulativeAmount',known_cumulative_amount,
      'cumulativeAmount',CASE WHEN t.unallocated_count=0 THEN known_cumulative_amount ELSE NULL END) ORDER BY date) FROM cumulative)
  ) INTO result FROM totals t;
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.copy_fixed_expenses_with_dates(p_store_id uuid,p_year_month text,p_dates jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE source_month text; source_count integer; recurring jsonb; source_ids text[];
BEGIN
  PERFORM public.assert_store_finance_access(p_store_id);
  PERFORM public.validate_recurring_expense_month(p_year_month);
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text,305));
  IF EXISTS(SELECT 1 FROM expenses WHERE store_id=p_store_id AND category='고정비' AND year_month=p_year_month) THEN RAISE EXCEPTION 'FIXED_EXPENSES_ALREADY_EXIST'; END IF;
  recurring:=public.get_recurring_fixed_expenses(p_store_id,p_year_month);
  SELECT max(year_month) INTO source_month FROM expenses WHERE store_id=p_store_id AND category='고정비' AND year_month<p_year_month;
  PERFORM 1 FROM expenses WHERE store_id=p_store_id AND category='고정비' AND year_month=source_month ORDER BY id FOR UPDATE;
  SELECT array_agg(e.id::text ORDER BY e.id::text) INTO source_ids FROM expenses e WHERE e.store_id=p_store_id AND e.category='고정비' AND e.year_month=source_month
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(recurring->'adoptedSourceIds') a WHERE a.value=e.id::text);
  source_count:=coalesce(cardinality(source_ids),0);
  IF source_count=0 OR jsonb_typeof(p_dates) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'FIXED_COPY_INVALID'; END IF;
  IF jsonb_array_length(p_dates)<>source_count OR (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_dates) x)<>source_count
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_dates) x WHERE NOT coalesce(x->>'id'=ANY(source_ids),false)
      OR x->>'occurred_on' IS NULL OR x->>'occurred_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      OR to_char((x->>'occurred_on')::date,'YYYY-MM')<>p_year_month) THEN RAISE EXCEPTION 'FIXED_COPY_INVALID'; END IF;
  INSERT INTO expenses(store_id,year_month,category,name,amount,occurred_on)
    SELECT p_store_id,p_year_month,e.category,e.name,e.amount,(x->>'occurred_on')::date FROM jsonb_array_elements(p_dates) x
      JOIN expenses e ON e.id::text=x->>'id' AND e.store_id=p_store_id;
END $$;
COMMIT;
