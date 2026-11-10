-- Shared notification rows are preserved. An irreversible personal dismissal only
-- affects the caller's list. Apply before deploying the corresponding client.
BEGIN;

CREATE TABLE public.notification_dismissals (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_id)
);
CREATE INDEX notification_dismissals_user_store ON public.notification_dismissals(user_id, store_id);

CREATE INDEX notification_dismissals_notification ON public.notification_dismissals(notification_id);
CREATE INDEX notification_dismissals_store ON public.notification_dismissals(store_id);

ALTER TABLE public.notification_dismissals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_dismissals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.notification_dismissals TO authenticated;

CREATE POLICY notification_dismissals_self_select ON public.notification_dismissals
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  AND public.is_store_member(store_id)
  AND EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.id = notification_id AND n.store_id = notification_dismissals.store_id
  )
);

CREATE POLICY notification_dismissals_self_insert ON public.notification_dismissals
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND public.is_store_member(store_id)
  AND EXISTS (
    -- The notification's existing RLS also enforces member/admin/financial scope.
    SELECT 1 FROM public.notifications n
    WHERE n.id = notification_id AND n.store_id = notification_dismissals.store_id
  )
);

COMMENT ON TABLE public.notification_dismissals IS 'Caller-only permanent notification dismissals; no authenticated UPDATE/DELETE grants.';
COMMIT;
