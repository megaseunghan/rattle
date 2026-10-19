import { act, renderHook } from '@testing-library/react-native';
import { useHomeAlerts } from '../../lib/hooks/useHomeAlerts';
let mockUser = { id: 'a' };
const mockStore = { id: 'store' };
const mockRead = jest.fn();
const mockGetReads = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, store: mockStore }) }));
jest.mock('../../lib/services/homeAlerts', () => ({
  buildHomeAlerts: () => [{ key: 'stock:one', kind: 'stock' }, { key: 'stock:two', kind: 'stock' }],
  getHomeAlertStock: async () => [], hasMonthlyFixedExpense: async () => true,
  getHomeAlertReads: (...args: unknown[]) => mockGetReads(...args),
  markHomeAlertRead: (...args: unknown[]) => mockRead(...args),
}));
beforeEach(() => { mockUser = { id: 'a' }; mockRead.mockReset().mockResolvedValue(undefined); mockGetReads.mockReset().mockResolvedValue([]); });
it('읽음 처리한 품목만 숨기고 저장 대상에 사용자와 매장을 명시한다', async () => {
  const { result } = renderHook(() => useHomeAlerts());
  await act(async () => { await result.current.refetch(); });
  await act(async () => { await result.current.markRead('stock:one'); });
  expect(result.current.alerts.map(alert => alert.key)).toEqual(['stock:two']);
  expect(mockRead).toHaveBeenCalledWith('store', 'a', 'stock:one');
});
it('읽음 저장 실패 시 알림을 숨기지 않는다', async () => {
  const { result } = renderHook(() => useHomeAlerts());
  await act(async () => { await result.current.refetch(); });
  mockRead.mockRejectedValue(new Error('denied'));
  await act(async () => { await expect(result.current.markRead('stock:one')).rejects.toThrow('denied'); });
  expect(result.current.alerts).toHaveLength(2);
});
it('계정 전환 전에 요청한 읽음 저장은 이전 화면 이동을 허용하지 않는다', async () => {
  let done!: () => void;
  mockRead.mockImplementation(() => new Promise<void>(resolve => { done = resolve; }));
  const { result, rerender } = renderHook(() => useHomeAlerts());
  let pending!: Promise<boolean>;
  act(() => { pending = result.current.markRead('stock:one'); });
  mockUser = { id: 'b' }; rerender({});
  await act(async () => { done(); expect(await pending).toBe(false); });
  expect(result.current.alerts).toEqual([]);
});
it('읽음 목록을 불러오지 못하면 확인 가능한 오류를 남긴다', async () => {
  mockGetReads.mockRejectedValue(new Error('schema unavailable'));
  const { result } = renderHook(() => useHomeAlerts());
  await act(async () => { await result.current.refetch(); });
  expect(result.current.error).toContain('홈 알림');
});
