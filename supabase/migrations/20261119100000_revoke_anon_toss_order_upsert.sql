-- 레거시 Toss 주문 저장 RPC의 익명/PUBLIC 실행 권한 회수.
-- 앱·Edge Function 호출처 없음(2026-11-19 확인). 함수 본문의 can_read_store_financials 가드는 유지.
-- authenticated/service_role 권한은 그대로 둔다.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.upsert_toss_order_with_items(uuid,text,timestamptz,numeric,text,jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_toss_order_with_items(uuid,text,timestamptz,numeric,text,jsonb) FROM anon;
COMMIT;
