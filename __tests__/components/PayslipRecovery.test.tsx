import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import PayslipScreen from '../../app/mypage/payslip';
const mockRead = jest.fn(), mockRefetch = jest.fn();
let mockStoreId = 'store', mockEmployment = 'regular', mockNonTaxable = 999999;
let mockEmployeeError: string | null = null;
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' }, store: { id: mockStoreId }, realRole: 'member', devPreviewMode: 'self' }) }));
jest.mock('../../lib/hooks/useEmployees', () => ({ useEmployees: () => ({ employees: [{ id: 'e', store_id: mockStoreId, user_id: 'u', is_active: true, employment_type: mockEmployment, non_taxable: mockNonTaxable }], refetch: mockRefetch, loading: false, error: mockEmployeeError }) }));
jest.mock('../../lib/services/payroll', () => ({ getMyPayroll: (...args: unknown[]) => mockRead(...args) }));
jest.mock('../../lib/icons/AppIcon', () => ({ AppIcon: () => null }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));
jest.mock('../../lib/components/ui', () => ({ AppBar: () => null }));
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
const payroll = { id: 'p', gross: 1000000, taxable_base: 800000, net_pay: 950000, national_pension: 10000, health_insurance: 5000, long_term_care: 1000, employment_insurance: 1000, income_tax: 0, local_income_tax: 0, withholding_tax: 33000 };
beforeEach(() => { jest.clearAllMocks(); mockRead.mockReset().mockResolvedValue(payroll); mockStoreId = 'store'; mockEmployment = 'regular'; mockNonTaxable = 999999; mockEmployeeError = null; });
it('이전 월 응답이 늦게 끝나도 선택 월의 명세를 덮지 않는다', async () => {
  const first = deferred<typeof payroll>(); mockRead.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ...payroll, net_pay: 222222 });
  render(<PayslipScreen />); fireEvent.press(screen.getByLabelText('이전 달'));
  await waitFor(() => expect(screen.getAllByText('222,222원').length).toBeGreaterThan(0));
  await act(async () => { first.resolve(payroll); });
  expect(screen.queryByText('950,000원')).toBeNull();
});
it('조회 실패와 미작성 명세를 분리하고 같은 월을 재시도한다', async () => {
  mockRead.mockRejectedValueOnce(new Error('offline')); render(<PayslipScreen />);
  await waitFor(() => expect(screen.getByText('다시 시도')).toBeTruthy());
  expect(screen.queryByText('이 달은 아직 급여명세가 작성되지 않았어요')).toBeNull();
  fireEvent.press(screen.getByText('다시 시도'));
  await waitFor(() => expect(screen.getAllByText('950,000원').length).toBeGreaterThan(0));
  expect(mockRead.mock.calls[0]).toEqual(mockRead.mock.calls[1]);
});
it('현재 고용형태·비과세를 바꿔도 과거 명세 설명·공제를 바꾸지 않는다', async () => {
  const { rerender } = render(<PayslipScreen />);
  await waitFor(() => expect(screen.getByText('원천징수')).toBeTruthy());
  expect(screen.getByText('국민연금')).toBeTruthy(); expect(screen.getByText('800,000원')).toBeTruthy();
  mockEmployment = 'part_time'; mockNonTaxable = 123456; rerender(<PayslipScreen />);
  expect(screen.getByText('국민연금')).toBeTruthy(); expect(screen.getByText('800,000원')).toBeTruthy();
  expect(screen.queryByText('123,456원')).toBeNull();
});
it('매장을 전환하면 기존 명세를 즉시 감추고 새 응답만 표시한다', async () => {
  const next = deferred<typeof payroll>(); const { rerender } = render(<PayslipScreen />);
  await waitFor(() => expect(screen.getAllByText('950,000원').length).toBeGreaterThan(0));
  mockRead.mockReturnValueOnce(next.promise); mockStoreId = 'other'; rerender(<PayslipScreen />);
  expect(screen.queryByText('950,000원')).toBeNull();
  await act(async () => { next.resolve({ ...payroll, net_pay: 333333 }); });
  expect(screen.getAllByText('333,333원').length).toBeGreaterThan(0);
});
