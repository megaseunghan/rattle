-- 기존 멤버의 applicant_name 백필: 연결된 직원 이름 우선, 없으면 이메일 앞부분
UPDATE store_members sm
SET applicant_name = e.name
FROM employees e
WHERE e.store_id = sm.store_id
  AND e.user_id = sm.user_id
  AND (sm.applicant_name IS NULL OR TRIM(sm.applicant_name) = '');

-- 직원 연결이 없는 멤버는 이메일 앞부분으로 임시 표기
UPDATE store_members
SET applicant_name = split_part(user_email, '@', 1)
WHERE (applicant_name IS NULL OR TRIM(applicant_name) = '')
  AND user_email IS NOT NULL;
