import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import WageConditionScreen from '../../app/payroll/wage-condition';
import { getWageHistory, addWageChange } from '../../lib/services/wageHistory';
import { getFinancialSummaries } from '../../lib/services/homeFinancialSummary';
import { router } from 'expo-router';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { useAuth } from '../../lib/contexts/AuthContext';

jest.mock('expo-router', () => ({ router: { back: jest.fn(), dismissTo: jest.fn() }, useLocalSearchParams: () => ({ storeId: 'store', employeeId: 'employee', targetMonth: '2026-09', returnScope: 'all' }) }));
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/hooks/useConfirmLeave', () => ({ useConfirmLeave: jest.fn() }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: [{ id: 'employee', name: '검증 직원', store_id: 'store', employment_type: 'regular', joined_at: '2026-09-01', created_at: '2026-09-01T00:00:00Z', base_salary: 3000000, non_taxable: 200000 }], loading: false, refetch: jest.fn().mockResolvedValue(undefined) }) }));
jest.mock('../../lib/services/wageHistory', () => ({ getWageHistory: jest.fn(), addWageChange: jest.fn(), todayISO: () => '2026-10-27' }));
jest.mock('../../lib/services/homeFinancialSummary', () => ({ getFinancialSummaries: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  (useConfirmLeave as jest.Mock).mockReturnValue(jest.fn());
  (useAuth as jest.Mock).mockReturnValue({ user: { id: 'user' }, store: { id: 'store', name: '검증 매장' }, currentRole: 'admin' });
  (getWageHistory as jest.Mock).mockResolvedValue([]);
  (addWageChange as jest.Mock).mockResolvedValue({ id: 'wage' });
  (getFinancialSummaries as jest.Mock).mockResolvedValue([{ laborCost: null }]);
});
async function fillDate() {
  await screen.findByLabelText('적용 시작일');
  fireEvent.changeText(screen.getByLabelText('적용 시작일'), '2026-09-01');
  fireEvent.press(screen.getByText('새 급여 입력으로'));
}
async function fillAmount() {
  fireEvent.changeText(screen.getByLabelText('새 기본급'), '3000000');
  fireEvent.changeText(screen.getByLabelText('비과세'), '200000');
  fireEvent.changeText(screen.getByLabelText('근거·메모'), '계약서 확인');
  fireEvent.press(screen.getByText('입력 내용 검토'));
}
it('입사일과 등록 급여를 기본값으로 제공하고 단계 검토 뒤에만 저장한다', async () => {
  render(<WageConditionScreen />);
  await waitFor(() => expect(screen.getByLabelText('적용 시작일')).toHaveDisplayValue('2026-09-01'));
  fireEvent.changeText(screen.getByLabelText('적용 시작일'), '2026-02-30');
  fireEvent.press(screen.getByText('새 급여 입력으로'));
  expect(screen.getByText('적용 시작일을 YYYY-MM-DD 형식으로 입력해 주세요.')).toBeTruthy();
  expect(addWageChange).not.toHaveBeenCalled();
  await fillDate();
  expect(screen.getByLabelText('새 기본급')).toHaveDisplayValue('3000000');
  await fillAmount();
  expect(screen.getByText(/저장된 월 급여 명세는/)).toBeTruthy();
  expect(addWageChange).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('금액·근거 수정'));
  expect(screen.getByLabelText('새 기본급')).toHaveDisplayValue('3000000');
  fireEvent.press(screen.getByText('검토로 돌아가기'));
  fireEvent.press(screen.getByText('변경 저장'));
  await waitFor(() => expect(addWageChange).toHaveBeenCalledTimes(1));
  expect(addWageChange).toHaveBeenCalledWith(expect.objectContaining({ effectiveDate: '2026-09-01', baseSalary: 3000000, nonTaxable: 200000 }));
  expect(await screen.findByText(/조건은 저장됐지만 선택월에/)).toBeTruthy();
  fireEvent.press(screen.getByText('원래 화면으로'));
  expect(router.dismissTo).toHaveBeenCalledWith({ pathname: '/(tabs)', params: { targetTab: 'home', homeScope: 'all', month: '2026-09' } });
});
it('최종 검토에서 적용일만 수정하면 금액 단계를 반복하지 않는다', async () => {
  render(<WageConditionScreen />); await fillDate(); await fillAmount();
  fireEvent.press(screen.getByText('적용일 수정'));
  fireEvent.changeText(screen.getByLabelText('적용 시작일'), '2026-09-02');
  fireEvent.press(screen.getByText('검토로 돌아가기'));
  expect(screen.getByText('적용 시작일 2026-09-02')).toBeTruthy();
  expect(screen.getByText('변경 저장')).toBeTruthy();
  expect(screen.queryByLabelText('새 기본급')).toBeNull();
  expect(addWageChange).not.toHaveBeenCalled();
});
it('같은 적용일의 조건이 있으면 저장을 막는다', async () => {
  (getWageHistory as jest.Mock).mockResolvedValue([{ id: 'old', effective_date: '2026-09-01' }]);
  render(<WageConditionScreen />); await fillDate();
  expect(screen.getByText('같은 적용일의 조건이 있어요. 이력을 확인하고 날짜를 다시 선택해 주세요.')).toBeTruthy();
  expect(addWageChange).not.toHaveBeenCalled();
});
it('다른 매장 또는 일반 직원은 급여조건 입력을 열지 않는다', () => {
  (useAuth as jest.Mock).mockReturnValue({ store: { id: 'other' }, currentRole: 'staff' });
  render(<WageConditionScreen />);
  expect(screen.getByText('매장과 관리자 권한을 확인한 뒤 다시 열어 주세요.')).toBeTruthy();
  expect(getWageHistory).not.toHaveBeenCalled();
});
it('변경 저장 뒤 손익 조회만 실패하면 조건 재저장으로 유도하지 않는다', async () => {
  (getFinancialSummaries as jest.Mock).mockRejectedValue(new Error('network'));
  render(<WageConditionScreen />); await fillDate(); await fillAmount();
  fireEvent.press(screen.getByText('변경 저장'));
  expect(await screen.findByText('급여 조건은 저장됐어요. 손익을 다시 불러와 주세요.')).toBeTruthy();
  expect(screen.queryByText('변경 저장')).toBeNull();
  expect(addWageChange).toHaveBeenCalledTimes(1);
});
it('저장 응답 유실 뒤 등록 이력 확인만 제공하고 중복 저장하지 않는다', async () => {
  (addWageChange as jest.Mock).mockRejectedValue(new Error('response lost'));
  render(<WageConditionScreen />); await fillDate(); await fillAmount();
  fireEvent.press(screen.getByText('변경 저장'));
  expect(await screen.findByText('등록 이력 확인')).toBeTruthy();
  expect(screen.queryByText('변경 저장')).toBeNull();
  fireEvent.press(screen.getByText('등록 이력 확인'));
  expect(await screen.findByText(/입력한 조건을 이력에서 확인하지/)).toBeTruthy();
  expect(addWageChange).toHaveBeenCalledTimes(1);
});

it('입사일 전 변경은 거절하고 최초 이력이 있으면 오늘을 기본값으로 제안한다', async () => {
 (getWageHistory as jest.Mock).mockResolvedValue([{id:'old',effective_date:'2026-09-01'}]);
 render(<WageConditionScreen />);
 await waitFor(() => expect(screen.getByLabelText('적용 시작일')).toHaveDisplayValue('2026-10-27'));
 fireEvent.changeText(screen.getByLabelText('적용 시작일'),'2026-08-31');
 fireEvent.press(screen.getByText('새 급여 입력으로'));
 expect(screen.getByText('입사일 이후의 적용일을 입력해 주세요.')).toBeTruthy();
 expect(addWageChange).not.toHaveBeenCalled();
});

it('불러온 기본값만 있으면 나가기 경고를 띄우지 않고 실제 수정만 감지한다', async () => {
 const view=render(<WageConditionScreen />);
 await waitFor(() => expect(screen.getByLabelText('적용 시작일')).toHaveDisplayValue('2026-09-01'));
 expect((useConfirmLeave as jest.Mock).mock.calls.at(-1)?.[0]).toBe(false);
 fireEvent.changeText(screen.getByLabelText('적용 시작일'),'2026-09-02');
 expect((useConfirmLeave as jest.Mock).mock.calls.at(-1)?.[0]).toBe(true);
 view.rerender(<WageConditionScreen />);
 expect(screen.getByLabelText('적용 시작일')).toHaveDisplayValue('2026-09-02');
 fireEvent.changeText(screen.getByLabelText('적용 시작일'),'2026-09-01');
 expect((useConfirmLeave as jest.Mock).mock.calls.at(-1)?.[0]).toBe(false);
 fireEvent.press(screen.getByText('새 급여 입력으로'));
 fireEvent.changeText(screen.getByLabelText('새 기본급'),'3200000');
 expect((useConfirmLeave as jest.Mock).mock.calls.at(-1)?.[0]).toBe(true);
 view.rerender(<WageConditionScreen />);
 expect(screen.getByLabelText('새 기본급')).toHaveDisplayValue('3200000');
});
