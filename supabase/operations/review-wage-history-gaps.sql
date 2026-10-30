-- 관리자 SQL Editor에서 읽기 전용으로 실행한다. 과거 조건을 자동 생성하지 않는다.
-- 급여·연락처·계좌는 출력하지 않으며, 적용일은 원본 자료와 대조 후 별도로 확정한다.
BEGIN READ ONLY;
SELECT s.name AS store_name, e.id AS employee_id, e.name AS employee_name,
       e.employment_type, e.joined_at,
       CASE WHEN NOT EXISTS (
         SELECT 1 FROM public.employee_wage_history h WHERE h.employee_id=e.id AND h.store_id=e.store_id
       ) THEN '이력 없음' ELSE '현재 적용 가능한 이력 없음' END AS review_reason
FROM public.employees e JOIN public.stores s ON s.id=e.store_id
WHERE e.is_active AND NOT EXISTS (
  SELECT 1 FROM public.employee_wage_history h
  WHERE h.employee_id=e.id AND h.store_id=e.store_id
    AND h.effective_date<=(now() AT TIME ZONE 'Asia/Seoul')::date
)
AND (e.joined_at IS NULL OR e.joined_at<=(now() AT TIME ZONE 'Asia/Seoul')::date)
ORDER BY s.name,e.name,e.id;
COMMIT;
