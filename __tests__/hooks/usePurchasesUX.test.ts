import { act, renderHook } from '@testing-library/react-native';
import { usePurchases } from '../../lib/hooks/usePurchases';
const mockGet = jest.fn();
const mockWrite = jest.fn();
let mockStore: { id: string } | null = { id: 'a' };
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: mockStore, devPreviewMode: 'self' }) }));
jest.mock('../../lib/query', () => ({ useQueryScope: () => 'account-role' }));
jest.mock('../../lib/services/purchases', () => ({ getPurchasesWithItemCountsByMonth: (...args: unknown[]) => mockGet(...args), createPurchaseWithItems: (...args: unknown[]) => mockWrite(...args) }));
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
it('등록 폼은 저장 성공 후 목록을 중복 조회하지 않고 갱신 결과를 반환한다', async () => {
  mockWrite.mockResolvedValue({ refreshFailed: true });
  mockGet.mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => usePurchases('2026-10'));
  await act(async () => {
    await expect(result.current.addWithItems({ date: '2026-10-01', supplier: '거래처', type: '수기', items: [] })).resolves.toEqual({ refreshFailed: true });
  });
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(mockGet).not.toHaveBeenCalled();
});
