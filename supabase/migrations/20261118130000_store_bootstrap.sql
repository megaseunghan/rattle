-- 앱 시작 시 매장 목록·멤버 역할·재무 열람 권한을 한 번에 돌려준다.
-- 기존에는 [소유 매장 조회 ∥ 참여 매장 조회] → get_my_store_financial_access 순서로 서버를 두 번 왕복했다.
--
-- SECURITY INVOKER: stores/store_members RLS를 호출자 권한 그대로 적용해, 기존 클라이언트 조회와 같은 행만 보인다.
-- 재무 권한은 기존 get_my_store_financial_access와 같은 판정(is_store_member + can_read_store_financials)을 쓴다.
-- 순서: 소유 매장(created_at) → 참여 매장(created_at), 같은 시각은 id.
CREATE OR REPLACE FUNCTION public.get_my_store_bootstrap()
RETURNS TABLE(store jsonb, member_role text, financial_access boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  membership AS (
    SELECT m.store_id, m.role
    FROM public.store_members m, me
    WHERE m.user_id = me.uid AND m.status = 'approved'
  ),
  visible AS (
    SELECT st.id, st.created_at, st.owner_id = me.uid AS owned, to_jsonb(st) AS doc
    FROM public.stores st, me
    WHERE me.uid IS NOT NULL
      AND (st.owner_id = me.uid OR st.id IN (SELECT store_id FROM membership))
  )
  SELECT v.doc,
         ms.role,
         public.is_store_member(v.id) AND coalesce(public.can_read_store_financials(v.id), false)
  FROM visible v
  LEFT JOIN membership ms ON ms.store_id = v.id
  ORDER BY v.owned DESC, v.created_at, v.id
$$;

REVOKE ALL ON FUNCTION public.get_my_store_bootstrap() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_store_bootstrap() TO authenticated;
