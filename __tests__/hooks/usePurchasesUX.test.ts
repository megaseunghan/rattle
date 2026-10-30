import { act, renderHook } from '@testing-library/react-native';
import { usePurchases } from '../../lib/hooks/usePurchases';
const mockGet = jest.fn();
const mockWrite = jest.fn();
let mockStore: { id: string } | null = { id: 'a' };
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore }) }));
jest.mock('../../lib/query', () => ({ useQueryScope: () => 'account-role' }));
jest.mock('../../lib/services/purchases', () => ({ getPurchasesByMonth: (...args: unknown[]) => mockGet(...args), createPurchaseWithItems: (...args: unknown[]) => mockWrite(...args) }));
beforeEach(() => { mockGet.mockReset(); mockWrite.mockReset(); mockStore = { id: 'a' }; });
it('최초 조회 전 0건 확정 상태를 만들지 않는다', () => {
  const { result } = renderHook(() => usePurchases('2026-10'));
  expect(result.current.loading).toBe(true);
});
it('매장 전환 시 이전 금액을 숨기고 늦은 응답도 무시한다', async () => {
  let resolveOld!: (rows: unknown[]) => void;
  mockGet.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce([{ id: 'b' }]);
  const { result, rerender } = renderHook(() => usePurchases('2026-10'));
  let oldRequest!: Promise<unknown>;
  act(() => { oldRequest = result.current.refetch(); });
  mockStore = { id: 'b' }; rerender({});
  expect(result.current.purchases).toEqual([]);
  expect(result.current.loading).toBe(true);
  await act(async () => { await result.current.refetch(); });
  await act(async () => { resolveOld([{ id: 'a' }]); await oldRequest; });
  expect(result.current.purchases).toEqual([{ id: 'b' }]);
});
it('쓰기 성공 뒤 목록 조회 실패도 재등록할 실패로 던지지 않는다', async () => {
  mockWrite.mockResolvedValue({ refreshFailed: false });
  mockGet.mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => usePurchases('2026-10'));
  await act(async () => {
    await expect(result.current.addWithItems({ date: '2026-10-01', supplier: '거래처', type: '수기', items: [] })).resolves.toEqual({ refreshFailed: true });
  });
  expect(mockWrite).toHaveBeenCalledTimes(1);
});
