-- 목적: 주 근무시간 0분을 서버에서도 받지 않는다(사용자 결정 2026-11-28 "받지 않게 해줘").
--   앱은 합류 신청 검사(validateOnboardingField: 0 이하 거절)와 주 근무시간 시트 확인 버튼(0분이면 꺼짐)으로 이미 막는다.
--   서버 CHECK는 0~10080을 허용해 앱을 거치지 않은 저장(이전 앱·직접 API)으로 0분이 들어갈 수 있었다.
--   0분이면 4대보험 판정·주휴 계산이 '주 15시간 미만'으로 조용히 바뀌므로, 모를 때는 0이 아니라 비워(NULL) 둔다.
-- 정책 문서: docs/intent/급여-계산-바로잡기.md 「리뷰 반영·서버 검사 보정 (2026-11-28)」.
-- 선행 파일: 20261127120000_payroll_v2_employee_fields.sql(employees_weekly_minutes_check),
--   20261127132000_join_income_probation.sql(store_join_profiles_weekly_minutes_check).
-- 기존 자료(2026-11-28 원격 조회): employees·store_join_profiles 모두 weekly_minutes = 0 인 행 0건. 자료는 바꾸지 않는다.
-- 기존 CHECK는 그대로 두고(이름·범위 유지) 0 초과 CHECK를 하나씩 더한다. weekly_hours(호환용 정수 시간)는
--   10~50분이면 내림해 0이 될 수 있으므로 건드리지 않는다.
-- 재실행: 제약 이름이 있으면 건너뛴다.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_weekly_minutes_positive_check' AND conrelid = 'public.employees'::regclass) THEN
    ALTER TABLE public.employees ADD CONSTRAINT employees_weekly_minutes_positive_check
      CHECK (weekly_minutes IS NULL OR weekly_minutes > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_join_profiles_weekly_minutes_positive_check' AND conrelid = 'public.store_join_profiles'::regclass) THEN
    ALTER TABLE public.store_join_profiles ADD CONSTRAINT store_join_profiles_weekly_minutes_positive_check
      CHECK (weekly_minutes IS NULL OR weekly_minutes > 0);
  END IF;
END $$;

COMMENT ON CONSTRAINT employees_weekly_minutes_positive_check ON public.employees IS '주 근무시간 0분 불가. 모르면 NULL';
COMMENT ON CONSTRAINT store_join_profiles_weekly_minutes_positive_check ON public.store_join_profiles IS '주 근무시간 0분 불가. 모르면 NULL';

COMMIT;
