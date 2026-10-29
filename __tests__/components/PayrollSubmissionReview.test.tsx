import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { PayrollSubmissionReview } from '../../lib/components/PayrollSubmissionReview';
import { usePayrollSubmissions } from '../../lib/hooks/usePayrollSubmissions';
import { Employee, Payroll, PayrollWorkSubmission } from '../../types';
jest.mock('../../lib/hooks/usePayrollSubmissions', () => ({ usePayrollSubmissions: jest.fn() }));
jest.mock('../../lib/services/payrollSubmissions', () => ({ reviewWorkMinutes: jest.fn() }));
const employee = { id: 'employee', name: '검증 직원' } as Employee;
const row = { id: 'submission', employee_id: 'employee', year_month: '2026-09', worked_minutes: 0, note: '미근무', version: 2, submitted_at: '2026-09-30T10:00:00Z', status: 'approved' } as PayrollWorkSubmission;
function view(payrolls: Payroll[] = []) { return render(<PayrollSubmissionReview yearMonth="2026-09" active={false} employees={[employee]} payrolls={payrolls} onApply={jest.fn()} />); }
beforeEach(() => { (usePayrollSubmissions as jest.Mock).mockReturnValue({ rows: [row], loading: false, error: null, refetch: jest.fn() }); });
it('0분 제출 확인과 급여 반영 대기를 구분한다', () => { view(); expect(screen.getByText('확인 완료 · 급여 반영 대기')).toBeTruthy(); expect(screen.getByText('시급·공제 검토 후 급여 반영')).toBeTruthy(); });
it('급여 반영과 정산 미확정을 구분한다', () => { view([{ employee_id: 'employee', work_submission_id: 'submission', is_settled: false } as Payroll]); expect(screen.getByText('급여 반영 완료 · 정산 미확정')).toBeTruthy(); });
it('정산 확정된 명세는 완료를 구분한다', () => { view([{ employee_id: 'employee', work_submission_id: 'submission', is_settled: true } as Payroll]); expect(screen.getByText('급여 반영 완료 · 정산 확정')).toBeTruthy(); });
it('조회중에는 미제출로 단정하지 않는다', () => { (usePayrollSubmissions as jest.Mock).mockReturnValue({ rows: [], loading: true, refetch: jest.fn() }); view(); expect(screen.getByText('제출 내역을 불러오는 중이에요.')).toBeTruthy(); expect(screen.queryByText(/아직 제출된/)).toBeNull(); });
it('확인할 제출이 없으면 빈 안내 카드를 표시하지 않는다', () => {
  (usePayrollSubmissions as jest.Mock).mockReturnValue({ rows: [], loading: false, error: null, refetch: jest.fn() });
  const result = view();
  expect(result.toJSON()).toBeNull();
});
it('조회 실패는 빈 제출로 숨기지 않고 재시도를 제공한다', () => {
  (usePayrollSubmissions as jest.Mock).mockReturnValue({ rows: [], loading: false, error: '제출 조회 실패', refetch: jest.fn() });
  view();
  expect(screen.getByText('제출 조회 실패')).toBeTruthy();
  expect(screen.getByText('다시 시도')).toBeTruthy();
});
