-- 조회 전용. SQL Editor에서 배포 대상 DB의 정의·기존 자료를 확인한다.
SELECT tablename,policyname,cmd,roles,qual,with_check FROM pg_policies
WHERE schemaname='public' AND tablename IN ('employees','payroll','employee_wage_history','payroll_work_history','account_unlink_jobs','toss_pending_installations','toss_webhook_events')
ORDER BY tablename,policyname;
SELECT p.proname,p.prosecdef,p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('create_purchase_with_items','update_purchase_item','delete_user_data','process_toss_webhook','claim_account_unlinks','assert_account_deletable');
-- 기존 자료가 매장 간에 잘못 연결되어 있다면 자동 수정하지 않고 원본부터 검토한다.
SELECT count(*) AS mismatched_purchase_items FROM purchase_items pi
JOIN purchases p ON p.id=pi.purchase_id LEFT JOIN ingredients i ON i.id=pi.ingredient_id
WHERE pi.store_id<>p.store_id OR (pi.ingredient_id IS NOT NULL AND i.store_id<>pi.store_id);
SELECT count(*) AS invalid_purchase_amounts FROM purchase_items
WHERE quantity IS NULL OR quantity<=0 OR unit_price IS NULL OR unit_price<0;
