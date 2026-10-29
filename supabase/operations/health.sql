-- 관리자 SQL Editor 조회 전용. 개인 식별자·급여·외부 원문은 출력하지 않는다.
SELECT count(*) AS unlink_pending,
       count(*) FILTER(WHERE attempts>=8) AS unlink_needs_review,
       count(*) FILTER(WHERE created_at<now()-interval '1 hour') AS unlink_older_than_hour,
       min(created_at) AS oldest_unlink_job
FROM public.account_unlink_jobs;
SELECT count(*) AS unmatched_pos_installations FROM public.toss_pending_installations WHERE status='pending';
SELECT max(processed_at) AS last_completed_webhook FROM public.toss_webhook_events;
-- 이벤트가 없다는 사실만으로 장애로 판정하지 않는다. 설치/해제 이벤트는 매출 수집과 별개다.
