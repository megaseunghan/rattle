BEGIN;

CREATE OR REPLACE FUNCTION public.valid_home_workflow(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE phase text; actions jsonb; action text;
BEGIN
  IF p_config IS NULL OR jsonb_typeof(p_config) <> 'object' THEN RETURN false; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_config)) <> 3 THEN RETURN false; END IF;
  FOREACH phase IN ARRAY ARRAY['open','business','close'] LOOP
    actions := p_config -> phase;
    IF actions IS NULL OR jsonb_typeof(actions) <> 'array' THEN RETURN false; END IF;
    IF jsonb_array_length(actions) > 10 THEN RETURN false; END IF;
    IF (SELECT count(DISTINCT value) FROM jsonb_array_elements(actions)) <> jsonb_array_length(actions) THEN RETURN false; END IF;
    FOR action IN SELECT jsonb_array_elements_text(actions) LOOP
      IF action IS NULL OR action NOT IN ('open_check','close_check','weekday_check','stock','stock_edit','schedule','purchase','recipes','sales','expenses') THEN RETURN false; END IF;
    END LOOP;
  END LOOP;
  RETURN true;
END $$;

CREATE TABLE IF NOT EXISTS public.store_home_workflows (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  configuration jsonb NOT NULL CHECK (public.valid_home_workflow(configuration)),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.store_home_workflows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_home_workflows FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.store_home_workflows TO authenticated;
DROP POLICY IF EXISTS home_workflow_read ON public.store_home_workflows;
CREATE POLICY home_workflow_read ON public.store_home_workflows FOR SELECT TO authenticated
  USING (public.is_store_member(store_id) OR public.is_store_admin(store_id));
DROP POLICY IF EXISTS home_workflow_insert ON public.store_home_workflows;
CREATE POLICY home_workflow_insert ON public.store_home_workflows FOR INSERT TO authenticated
  WITH CHECK (public.is_store_admin(store_id));
DROP POLICY IF EXISTS home_workflow_update ON public.store_home_workflows;
CREATE POLICY home_workflow_update ON public.store_home_workflows FOR UPDATE TO authenticated
  USING (public.is_store_admin(store_id)) WITH CHECK (public.is_store_admin(store_id));
NOTIFY pgrst, 'reload schema';
COMMIT;
