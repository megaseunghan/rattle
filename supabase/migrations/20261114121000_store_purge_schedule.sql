-- 삭제 대기 매장 파기 예약(매일 03:17 UTC = 12:17 KST).
-- 원격 Supabase 전용. pg_cron이 없는 로컬·CI에서는 건너뛴다(PGlite 검증에도 포함하지 않음).
-- 선행: 20261114120000_store_soft_delete.sql. Supabase 대시보드에서 pg_cron을 먼저 활성화하는 것을 권장.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron unavailable: purge schedule skipped';
    RETURN;
  END IF;
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  -- 같은 이름이면 기존 작업을 갱신한다.
  PERFORM cron.schedule('rattle-purge-deleted-stores', '17 3 * * *', 'SELECT public.purge_expired_deleted_stores()');
END $$;
