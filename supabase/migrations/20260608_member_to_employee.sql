-- 매장 연결 요청 → 승인 시 직원(employees) 자동 생성
-- 흐름: 회원가입 → 매장 참여 신청(이름·연락처 입력) → 관리자 승인 → 직원 자동 생성(출퇴근+인건비 대상)

-- 1) 참여 신청 시 입력받은 이름/연락처 보관
ALTER TABLE store_members
  ADD COLUMN IF NOT EXISTS applicant_name TEXT,
  ADD COLUMN IF NOT EXISTS phone          TEXT;

-- 2) 승인 시 직원 자동 생성 트리거 함수 (SECURITY DEFINER로 RLS 우회)
CREATE OR REPLACE FUNCTION create_employee_on_member_approve()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 상태가 approved로 전환되는 순간에만
  IF NEW.status = 'approved' AND COALESCE(OLD.status, '') <> 'approved' THEN
    -- 이미 연결된 직원이 없을 때만 생성
    IF NOT EXISTS (
      SELECT 1 FROM employees
      WHERE store_id = NEW.store_id AND user_id = NEW.user_id
    ) THEN
      INSERT INTO employees (store_id, user_id, name, phone, joined_at)
      VALUES (
        NEW.store_id,
        NEW.user_id,
        COALESCE(NULLIF(TRIM(NEW.applicant_name), ''), split_part(COALESCE(NEW.user_email, '직원'), '@', 1)),
        NEW.phone,
        CURRENT_DATE
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_approve_employee ON store_members;
CREATE TRIGGER trg_member_approve_employee
  AFTER UPDATE ON store_members
  FOR EACH ROW
  EXECUTE FUNCTION create_employee_on_member_approve();
