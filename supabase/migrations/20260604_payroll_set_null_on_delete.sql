-- payroll.employee_id: ON DELETE CASCADE → ON DELETE SET NULL
-- 직원 삭제 시 payroll 레코드는 보존 (employee_id만 null로)
ALTER TABLE payroll ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE payroll
  DROP CONSTRAINT payroll_employee_id_fkey,
  ADD CONSTRAINT payroll_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
