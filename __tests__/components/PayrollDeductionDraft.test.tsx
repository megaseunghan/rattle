import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { EmployeeCard } from '../../app/(tabs)/payroll';
import { Employee, Payroll } from '../../types';
jest.mock('expo-router', () => ({ router: {}, useFocusEffect: jest.fn(), useNavigation: jest.fn() }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: jest.fn() }));
jest.mock('../../lib/hooks/usePayroll', () => ({ usePayroll: jest.fn() }));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: jest.fn() }));
jest.mock('../../lib/services/employees', () => ({ isInProbation: () => false, isInsuranceApplicable: () => true }));
jest.mock('../../lib/services/payroll', () => ({ probationFactor: () => 1, getPayrollSettlementGaps: () => ({ missingPayroll: [], missingPartTimeMinutes: [] }) }));
jest.mock('../../lib/services/wageHistory', () => ({}));
jest.mock('../../lib/components/PayrollSubmissionReview', () => ({ PayrollSubmissionReview: () => null }));
jest.mock('../../lib/components/WorkMinutesForm', () => ({ WorkMinutesForm: () => null }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../../lib/utils/layoutAnimation', () => ({ animateListChange: jest.fn() }));
jest.mock('../../lib/components/ui', () => {
 const { Text } = require('react-native'); return { Badge: ({label}:any) => <Text>{label}</Text> };
});
const employee = { id: 'e', name: 'QA 직원', employment_type: 'regular', base_salary: 1000 } as Employee;
const saved = { id: 'p', store_id: 's', employee_id: 'e', year_month: '2026-10', gross: 1000, net_pay: 900,
 national_pension: 100, health_insurance: 0, long_term_care: 0, employment_insurance: 0, income_tax: 0,
 local_income_tax: 0, withholding_tax: 0, is_settled: true, revision: 1 } as Payroll;
const save = jest.fn();
function card(payroll: Payroll | undefined = saved) {
 return <EmployeeCard employee={employee} payroll={payroll} accruedGross={1000} accrualLabel="10월" onShowHistory={jest.fn()} isCalculating={false} onCalculate={jest.fn()} canCalculate canEditDeductions isSavingDeductions={false} onSaveDeductions={save} />;
}
function expand() { fireEvent.press(screen.getByLabelText('QA 직원 급여 상세')); }
beforeEach(() => { save.mockReset().mockResolvedValue(undefined); });
it('편집 중에도 저장된 확정액은 유지하고 미저장 예상액을 별도로 표시한다', () => {
 render(card()); expand(); fireEvent.changeText(screen.getByLabelText('국민연금 공제액, 원'), '200');
 expect(screen.getAllByText('900원')).toHaveLength(2); expect(screen.getByText('800원')).toBeTruthy();
 expect(screen.getByText('편집 중 예상 실수령액 · 미저장')).toBeTruthy();
 expect(screen.getByText('공제액을 저장하면 정산 확정이 해제돼요. 검토 후 다시 확정해주세요.')).toBeTruthy();
 expect(save).not.toHaveBeenCalled();
});
it('같은 명세 재조회는 작성값을 유지하고 서버 금액이 바뀌면 저장을 막는다', () => {
 const view = render(card()); expand(); fireEvent.changeText(screen.getByLabelText('국민연금 공제액, 원'), '200');
 view.rerender(card({ ...saved })); expect(screen.getByLabelText('국민연금 공제액, 원').props.value).toBe('200');
 view.rerender(card({ ...saved, national_pension: 150, net_pay: 850, revision: 2 }));
 expect(screen.getByLabelText('국민연금 공제액, 원').props.value).toBe('200');
 expect(screen.getAllByText('850원')).toHaveLength(2);
 fireEvent.press(screen.getByText('공제 내역 저장')); expect(save).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('저장된 값으로 되돌리기'));
 expect(screen.getByLabelText('국민연금 공제액, 원').props.value).toBe('150');
 expect(screen.queryByText('편집 중 예상 실수령액 · 미저장')).toBeNull();
});
it('재조회 중 명세가 잠깐 비어도 초안을 보존한다', () => {
 const view = render(card()); expand(); fireEvent.changeText(screen.getByLabelText('국민연금 공제액, 원'), '200');
 view.rerender(React.cloneElement(card(), { payroll: undefined })); view.rerender(card({ ...saved }));
 expect(screen.getByLabelText('국민연금 공제액, 원').props.value).toBe('200');
});
it('저장 실패와 연타에도 초안을 유지하고 쓰기는 한 번만 호출한다', async () => {
 let reject!: (error: Error) => void; save.mockReturnValue(new Promise((_, no) => { reject = no; }));
 render(card()); expand(); fireEvent.changeText(screen.getByLabelText('국민연금 공제액, 원'), '200');
 fireEvent.press(screen.getByText('공제 내역 저장')); fireEvent.press(screen.getByText('공제 내역 저장'));
 expect(save).toHaveBeenCalledTimes(1); await act(async () => reject(new Error('failed')));
 expect(screen.getByLabelText('국민연금 공제액, 원').props.value).toBe('200');
});
it('저장 성공 후에는 서버에서 받은 금액을 표시하고 편집 예상액을 닫는다', async () => {
 const view = render(card()); expand(); fireEvent.changeText(screen.getByLabelText('국민연금 공제액, 원'), '200');
 fireEvent.press(screen.getByText('공제 내역 저장')); await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
 view.rerender(card({ ...saved, national_pension: 200, net_pay: 800, is_settled: false, revision: 2 }));
 await waitFor(() => expect(screen.queryByText('편집 중 예상 실수령액 · 미저장')).toBeNull());
 expect(screen.getAllByText('800원')).toHaveLength(2); expect(screen.getAllByText('저장된 실수령액')).toHaveLength(2);
});
it('공제 초과를 0원 예상액으로 감추지 않는다', () => {
 render(card()); expand(); fireEvent.changeText(screen.getByLabelText('국민연금 공제액, 원'), '2000');
 expect(screen.getByText('확인 필요')).toBeTruthy(); fireEvent.press(screen.getByText('공제 내역 저장'));
 expect(save).not.toHaveBeenCalled();
});
it('월별로 카드가 다시 만들어져도 미저장 공제 초안을 복원한다', () => {
 const cache = new Map();
 const view = render(React.cloneElement(card(), { draftCache: cache, draftKey: 's:2026-10:e' })); expand();
 fireEvent.changeText(screen.getByLabelText('국민연금 공제액, 원'), '200'); view.unmount();
 render(React.cloneElement(card(), { draftCache: cache, draftKey: 's:2026-10:e' })); expand();
 expect(screen.getByLabelText('국민연금 공제액, 원').props.value).toBe('200');
});
it('다른 매장·월에는 이전 초안이 섞이지 않는다', () => {
 const cache = new Map(); const first = render(React.cloneElement(card(), { draftCache: cache, draftKey: 's:2026-10:e' })); expand();
 fireEvent.changeText(screen.getByLabelText('국민연금 공제액, 원'), '200'); first.unmount();
 render(React.cloneElement(card({ ...saved, id: 'other', store_id: 'other', year_month: '2026-09' }), { draftCache: cache, draftKey: 'other:2026-09:e' })); expand();
 expect(screen.getByLabelText('국민연금 공제액, 원').props.value).toBe('100');
 expect(screen.queryByText('편집 중 예상 실수령액 · 미저장')).toBeNull();
});
it('월 이동을 취소하면 공제 초안을 유지하고 이동 확정 후에는 버린다', async () => {
 const { PayrollScreen } = require('../../app/(tabs)/payroll');
 const { Alert } = require('react-native');
 require('../../lib/contexts/AuthContext').useAuth.mockReturnValue({ store: { id: 's' }, currentRole: 'admin', user: { id: 'u' } });
 require('../../lib/hooks/useEmployees').useEmployees.mockReturnValue({ employees: [{ ...employee, store_id: 's', is_active: true, joined_at: '2026-01-01', created_at: '2026-01-01' }], loading: false, refetch: jest.fn() });
 const now = new Date(); const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
 require('../../lib/hooks/usePayroll').usePayroll.mockReturnValue({ payrolls: [{ ...saved, year_month: ym }], loading: false, calculating: null, savingDeductions: null, refetch: jest.fn(), calculate: jest.fn(), saveDeductions: save });
 const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
 try {
  render(<PayrollScreen />); expand(); fireEvent.changeText(screen.getByLabelText('국민연금 공제액, 원'), '200');
  fireEvent.press(screen.getByLabelText('이전 달'));
  expect(alertSpy.mock.calls.at(-1)?.[0]).toBe('공제 입력을 버리고 이동할까요?');
  act(() => { const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[] | undefined; buttons?.find((b:any)=>b.text==='계속 작성')?.onPress?.(); });
  expect(screen.getByLabelText('국민연금 공제액, 원').props.value).toBe('200');
  fireEvent.press(screen.getByLabelText('이전 달'));
  act(() => { const buttons = alertSpy.mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[] | undefined; buttons?.find((b:any)=>b.text==='이동')?.onPress?.(); });
  expect(screen.queryByLabelText('국민연금 공제액, 원')).toBeNull();
  fireEvent.press(screen.getByLabelText('다음 달')); expand();
  expect(screen.getByLabelText('국민연금 공제액, 원').props.value).toBe('100');
 } finally { alertSpy.mockRestore(); }
});
