BEGIN;
CREATE TABLE public.home_alert_reads (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_key text NOT NULL CHECK (length(alert_key) BETWEEN 1 AND 300),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id, alert_key)
);
ALTER TABLE public.home_alert_reads ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.home_alert_reads TO authenticated;
CREATE POLICY home_alert_reads_self_select ON public.home_alert_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_store_member(store_id));
CREATE POLICY home_alert_reads_self_insert ON public.home_alert_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_store_member(store_id));
COMMIT;
