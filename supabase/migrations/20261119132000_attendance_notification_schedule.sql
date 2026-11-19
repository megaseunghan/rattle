-- In-app only: overdue 16-hour work needs a clock-driven check even without new scans.
-- Prerequisite: 20261119131000_attendance_unprocessed_notifications.sql.
-- Supabase pg_cron convention, same named job updates idempotently. No external delivery.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_available_extensions WHERE name='pg_cron') THEN
  RAISE NOTICE 'pg_cron unavailable: attendance notification schedule skipped';
  RETURN;
 END IF;
 CREATE EXTENSION IF NOT EXISTS pg_cron;
 PERFORM cron.schedule('rattle-attendance-unprocessed','*/5 * * * *',
  'CALL private.process_attendance_notification_queue()');
END $$;
