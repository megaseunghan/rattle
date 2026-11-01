import { act, renderHook } from '@testing-library/react-native';
import { usePayroll } from '../../lib/hooks/usePayroll';
import { Payroll } from '../../types';
let mockStore = { id: 's' };
const mockRead = jest.fn(), mockSave = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore }) }));
jest.mock('../../lib/services/payroll', () => ({ getPayrollByMonth: (...args: unknown[]) => mockRead(...args), updatePayrollDeductions: (...args: unknown[]) => mockSave(...args) }));
jest.mock('../../lib/services/wageHistory', () => ({}));
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(yes => { resolve = yes; }); return { promise, resolve }; }
const row = { id: 'p', employee_id: 'e', store_id: 's', year_month: '2026-10', gross: 1000, net_pay: 900 } as Payroll;
const values = { national_pension: 200, health_insurance: 0, long_term_care: 0, employment_insurance: 0, income_tax: 0, local_income_tax: 0, withholding_tax: 0 };
beforeEach(() => { mockStore = { id: 's' }; mockRead.mockReset().mockResolvedValue([row]); mockSave.mockReset().mockResolvedValue({ ...row, net_pay: 800, is_settled: false }); });
it('공제 저장 뒤 늦게 도착한 저장 전 조회는 새 금액을 덮지 않는다', async () => {
 const { result } = renderHook(() => usePayroll('2026-10')); await act(async () => { await result.current.refetch(); });
 const oldRead = deferred(); mockRead.mockReturnValueOnce(oldRead.promise); let pending!: Promise<void>;
 act(() => { pending = result.current.refetch(); });
 await act(async () => { await result.current.saveDeductions(row, values); });
 await act(async () => { oldRead.resolve([row]); await pending; });
 expect(result.current.payrolls[0].net_pay).toBe(800); expect(result.current.loading).toBe(false);
});
it('월 이동 뒤 이전 월 저장 응답이 새 월 명세를 덮지 않는다', async () => {
 const response = deferred(); mockSave.mockReturnValueOnce(response.promise);
 const { result, rerender } = renderHook((props: { month: string }) => usePayroll(props.month), { initialProps: { month: '2026-10' } });
 let pending!: Promise<Payroll>; act(() => { pending = result.current.saveDeductions(row, values); });
 rerender({ month: '2026-09' }); mockRead.mockResolvedValueOnce([{ ...row, id: 'sep', year_month: '2026-09', net_pay: 700 }]);
 await act(async () => { await result.current.refetch(); });
 await act(async () => { response.resolve({ ...row, net_pay: 800 }); await pending; });
 expect(result.current.payrolls[0].id).toBe('sep'); expect(result.current.savingDeductions).toBeNull();
});
it('다른 매장·월 명세 저장을 요청하기 전에 차단한다', async () => {
 const { result } = renderHook(() => usePayroll('2026-09'));
 await expect(result.current.saveDeductions(row, values)).rejects.toThrow('선택한 매장과 월'); expect(mockSave).not.toHaveBeenCalled();
});
it('동일 범위 저장 중 재진입을 막는다', async () => {
 const response = deferred(); mockSave.mockReturnValue(response.promise); const { result } = renderHook(() => usePayroll('2026-10'));
 let pending!: Promise<Payroll>; act(() => { pending = result.current.saveDeductions(row, values); });
 await expect(result.current.saveDeductions(row, values)).rejects.toThrow('공제 저장이 진행'); expect(mockSave).toHaveBeenCalledTimes(1);
 await act(async () => { response.resolve(row); await pending; });
});
it('공제 저장 중 새로고침을 눌러도 다른 직원 명세와 월 합계를 보존한다', async () => {
 const other = { ...row, id: 'p2', employee_id: 'e2', gross: 2000, net_pay: 1800 };
 mockRead.mockResolvedValueOnce([row, other]);
 const { result } = renderHook(() => usePayroll('2026-10'));
 await act(async () => { await result.current.refetch(); });
 const response = deferred(); mockSave.mockReturnValueOnce(response.promise);
 let pending!: Promise<Payroll>;
 act(() => { pending = result.current.saveDeductions(row, values); });
 await act(async () => { await result.current.refetch(); });
 await act(async () => { response.resolve({ ...row, net_pay: 800 }); await pending; });
 expect(result.current.payrolls).toHaveLength(2);
 expect(result.current.payrolls).toContainEqual(other);
 expect(result.current.totalLaborCost).toBe(3000);
 expect(result.current.totalNetPay).toBe(2600);
 expect(mockRead).toHaveBeenCalledTimes(1);
});
it('저장 전에 시작한 월 재조회가 늦게 끝나도 다른 직원 명세와 합계를 유지한다', async () => {
 const other = { ...row, id: 'p2', employee_id: 'e2', gross: 2000, net_pay: 1800 };
 mockRead.mockResolvedValueOnce([row, other]);
 const { result } = renderHook(() => usePayroll('2026-10'));
 await act(async () => { await result.current.refetch(); });
 const response = deferred(); mockRead.mockReturnValueOnce(response.promise);
 let pending!: Promise<void>;
 act(() => { pending = result.current.refetch(); });
 await act(async () => { await result.current.saveDeductions(row, values); });
 await act(async () => { response.resolve([row, other]); await pending; });
 expect(result.current.payrolls).toHaveLength(2);
 expect(result.current.payrolls).toContainEqual(other);
 expect(result.current.totalNetPay).toBe(2600);
 expect(result.current.loading).toBe(false);
});
