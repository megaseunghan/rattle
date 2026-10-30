-- 읽기 전용: 승인 대기 신청과 이름 또는 연락처가 겹치는 직원만 조회.
-- 개인정보가 포함되므로 결과 전체를 외부에 공유하지 마세요.
SELECT s.name AS store_name,
       m.id AS request_id,
       m.applicant_name AS applicant_name,
       m.phone AS applicant_phone,
       e.id AS employee_id,
       e.name AS employee_name,
       e.phone AS employee_phone,
       e.is_active AS employee_active,
       (e.user_id IS NOT NULL) AS employee_has_account,
       (trim(e.name) = trim(coalesce(m.applicant_name, ''))) AS same_name,
       (regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g') =
        regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')) AS same_phone
FROM public.store_members m
JOIN public.stores s ON s.id = m.store_id
LEFT JOIN public.employees e ON e.store_id = m.store_id AND (
  trim(e.name) = trim(coalesce(m.applicant_name, '')) OR
  regexp_replace(coalesce(e.phone, ''), '[^0-9]', '', 'g') =
  regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')
)
WHERE m.status = 'pending'
ORDER BY s.name, m.created_at, e.name;

-- 서버 승인 함수가 로컬 구현과 같은지 대조하기 위한 정의.
SELECT pg_get_functiondef('public.create_employee_on_member_approve()'::regprocedure)
  AS approval_function;
