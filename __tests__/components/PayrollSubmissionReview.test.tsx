let mockOwner=true;
let mockEmployeeId='self';
jest.mock('../../lib/contexts/AuthContext',()=>({useAuth:()=>({user:{id:'u'},store:{id:'s'},devPreviewMode:'self',access:{is_owner:mockOwner,employee_id:mockEmployeeId},canManageStore:true})}));
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { PayrollSubmissionReview } from '../../lib/components/PayrollSubmissionReview';
import { usePayrollSubmissions } from '../../lib/hooks/usePayrollSubmissions';
import { Employee, Payroll, PayrollWorkSubmission } from '../../types';
jest.mock('../../lib/hooks/usePayrollSubmissions', () => ({ usePayrollSubmissions: jest.fn() }));
jest.mock('../../lib/services/payrollSubmissions', () => ({ reviewWorkMinutes: jest.fn() }));
const employee = { id: 'employee', name: '검증 직원' } as Employee;
const row = { id: 'submission', employee_id: 'employee', year_month: '2026-09', worked_minutes: 0, note: '미근무', version: 2, submitted_at: '2026-09-30T10:00:00Z', status: 'approved' } as PayrollWorkSubmission;
function view(payrolls: Payroll[] = []) { return render(<PayrollSubmissionReview yearMonth="2026-09" active={false} employees={[employee]} payrolls={payrolls} onApply={jest.fn()} />); }
beforeEach(() => { mockOwner=true;mockEmployeeId='self';jest.clearAllMocks(); (usePayrollSubmissions as jest.Mock).mockReturnValue({ rows: [row], loading: false, error: null, refetch: jest.fn() }); });
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

it.each(['pending','approved'])('점장 본인의 %s 월 합계에는 승인·반려·반영 버튼을 열지 않는다',status=>{
 mockOwner=false;mockEmployeeId='employee';
 (usePayrollSubmissions as jest.Mock).mockReturnValue({rows:[{...row,status}],loading:false,error:null,refetch:jest.fn()});
 view();expect(screen.queryByText('제출 확인 후 급여 검토')).toBeNull();expect(screen.queryByText('반려')).toBeNull();expect(screen.queryByText('시급·공제 검토 후 급여 반영')).toBeNull();
});
it('점장 본인의 user_id가 일치해도 승인 버튼을 숨긴다',()=>{
 mockOwner=false;
 (usePayrollSubmissions as jest.Mock).mockReturnValue({rows:[{...row,status:'pending'}],loading:false,error:null,refetch:jest.fn()});
 render(<PayrollSubmissionReview yearMonth="2026-09" active={false} employees={[{...employee,user_id:'u'}]} payrolls={[]} onApply={jest.fn()}/>);
 expect(screen.queryByText('제출 확인 후 급여 검토')).toBeNull();
});
it('타인 승인 버튼을 받은 뒤 본인으로 판정이 바뀌면 이전 콜백을 막는다',async()=>{
 mockOwner=false;
 (usePayrollSubmissions as jest.Mock).mockReturnValue({rows:[{...row,status:'pending'}],loading:false,error:null,refetch:jest.fn()});
 const v=view();const press=v.UNSAFE_getAllByType(require('../../lib/components/ui').Button).find(b=>b.props.label==='제출 확인 후 급여 검토')!.props.onPress;
 mockEmployeeId='employee';v.rerender(<PayrollSubmissionReview yearMonth="2026-09" active={false} employees={[employee]} payrolls={[]} onApply={jest.fn()}/>);
 await act(async()=>{await press();});
 expect(require('../../lib/services/payrollSubmissions').reviewWorkMinutes).not.toHaveBeenCalled();
});

it.each([true,false])('사장 본인 또는 점장 타인의 승인 동작을 유지한다: owner=%s',async owner=>{
 mockOwner=owner;mockEmployeeId='self';
 const review=require('../../lib/services/payrollSubmissions').reviewWorkMinutes as jest.Mock;
 review.mockResolvedValue({...row,status:'approved'});
 (usePayrollSubmissions as jest.Mock).mockReturnValue({rows:[{...row,status:'pending'}],loading:false,error:null,refetch:jest.fn()});
 view();await act(async()=>{fireEvent.press(screen.getByText('제출 확인 후 급여 검토'));});
 expect(review).toHaveBeenCalledTimes(1);
});
