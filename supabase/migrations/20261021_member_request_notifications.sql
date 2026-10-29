BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_category_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_category_check
  CHECK (category IN ('attendance', 'stock', 'sales', 'members'));

-- 참여 요청에는 신청자 정보가 포함되므로 관리자만 조회·수정한다.
DROP POLICY IF EXISTS notifications_store_member ON public.notifications;
CREATE POLICY notifications_store_member ON public.notifications FOR ALL
  USING (public.is_store_member(store_id) AND (category <> 'members' OR public.is_store_admin(store_id)))
  WITH CHECK (public.is_store_member(store_id) AND (category <> 'members' OR public.is_store_admin(store_id)));
-- 다른 허용 정책이 추가되어도 직원에게 참여 요청을 노출하지 않는다.
CREATE POLICY notifications_members_admin_only ON public.notifications AS RESTRICTIVE FOR ALL
  USING (category <> 'members' OR public.is_store_admin(store_id))
  WITH CHECK (category <> 'members' OR public.is_store_admin(store_id));

CREATE FUNCTION public.notify_store_membership_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.status = 'pending' THEN RETURN NEW; END IF;
    END IF;
    INSERT INTO public.notifications(store_id, category, type, title, message, dedupe_key)
    VALUES (NEW.store_id, 'members', 'membership_request', '매장 참여 요청',
      coalesce(nullif(trim(NEW.applicant_name), ''), '새 직원') || ' 님이 매장 참여를 요청했어요. 확인 후 승인해주세요.',
      'membership_request:' || NEW.id::text)
    ON CONFLICT (store_id, dedupe_key) DO UPDATE
      SET is_read = false, created_at = now(), message = EXCLUDED.message;
  ELSE
    UPDATE public.notifications SET is_read = true
      WHERE store_id = NEW.store_id AND dedupe_key = 'membership_request:' || NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_store_membership_request() FROM PUBLIC;
CREATE TRIGGER notify_store_membership_request
AFTER INSERT OR UPDATE OF status ON public.store_members
FOR EACH ROW EXECUTE FUNCTION public.notify_store_membership_request();

-- 적용 전에 접수된 승인 대기도 알림에 포함한다.
INSERT INTO public.notifications(store_id, category, type, title, message, dedupe_key, created_at)
SELECT store_id, 'members', 'membership_request', '매장 참여 요청',
  coalesce(nullif(trim(applicant_name), ''), '새 직원') || ' 님이 매장 참여를 요청했어요. 확인 후 승인해주세요.',
  'membership_request:' || id::text, created_at
FROM public.store_members WHERE status = 'pending'
ON CONFLICT (store_id, dedupe_key) DO NOTHING;

COMMIT;
