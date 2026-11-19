BEGIN;
-- 숨김 실행취소: 기존 SELECT/INSERT 범위와 동일한 본인·소속 매장만 허용한다.
GRANT DELETE ON public.home_alert_reads TO authenticated;
CREATE POLICY home_alert_reads_self_delete ON public.home_alert_reads
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_store_member(store_id));
COMMIT;
