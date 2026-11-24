import { act, renderHook } from '@testing-library/react-native';
import { useHomeAlerts } from '../../lib/hooks/useHomeAlerts';
import { notifyManager } from '@tanstack/react-query';
import { queryClient as mockSharedQueryClient } from '../../lib/query/client';
// 훅이 공용 쿼리 캐시를 쓰므로 테스트마다 비우고, 화면 알림을 동기로 받아 act 안에서 반영되게 한다.
notifyManager.setScheduler(callback => callback());
beforeEach(() => { mockSharedQueryClient.clear(); });
let mockUser = { id: 'a' };
let mockStore: { id: string; toss_merchant_id?: string } = { id: 'store' };
let mockAlerts: { key: string; kind: string }[] = [];
const mockBuild = jest.fn();
const mockRestore = jest.fn();
const mockRead = jest.fn();
const mockGetReads = jest.fn();
const mockStock = jest.fn().mockResolvedValue([]);
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser, store: mockStore }) }));
jest.mock('../../lib/services/homeAlerts', () => ({
  buildHomeAlerts: (input: unknown) => { mockBuild(input); return mockAlerts; },
  getHomeAlertStock: (...args: unknown[]) => mockStock(...args), hasMonthlyFixedExpense: async () => true,
  getHomeAlertReads: (...args: unknown[]) => mockGetReads(...args),
  restoreHomeAlert: (...args: unknown[]) => mockRestore(...args),
  markHomeAlertRead: (...args: unknown[]) => mockRead(...args),
}));
beforeEach(() => { mockRestore.mockReset().mockResolvedValue(undefined); mockUser = { id: 'a' }; mockStore = { id: 'store' }; mockBuild.mockReset();
  mockAlerts = [{ key: 'stock:one', kind: 'stock' }, { key: 'stock:two', kind: 'stock' }]; mockRead.mockReset().mockResolvedValue(undefined); mockGetReads.mockReset().mockResolvedValue([]); });
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
it('오늘 매출 값이 바뀌어도 알림 원본을 다시 조회하지 않는다', async () => {
  const { result, rerender } = renderHook(({ sales }: { sales?: number }) => useHomeAlerts(sales), { initialProps: { sales: undefined as number | undefined } });
  const first = result.current.refetch;
  rerender({ sales: 12000 });
  expect(result.current.refetch).toBe(first);
});
it('토스 미동기화 알림은 현재 오늘 매출이 0원일 때만 보인다', async () => {
  mockStore = { id: 'store', toss_merchant_id: 'm' };
  mockAlerts = [{ key: 'stock:one', kind: 'stock' }, { key: 'tossNotSynced:2026-11-18', kind: 'tossNotSynced' }];
  const { result, rerender } = renderHook(({ sales }: { sales?: number }) => useHomeAlerts(sales), { initialProps: { sales: undefined as number | undefined } });
  await act(async () => { await result.current.refetch(); });
  expect(mockBuild).toHaveBeenCalledWith(expect.objectContaining({ tossNotSynced: true }));
  expect(mockGetReads).toHaveBeenCalledWith('store', 'a', ['stock:one', 'tossNotSynced:2026-11-18']);
  expect(result.current.alerts.map(alert => alert.kind)).toEqual(['stock']);
  rerender({ sales: 0 });
  expect(result.current.alerts.map(alert => alert.kind)).toEqual(['stock', 'tossNotSynced']);
  rerender({ sales: 5000 });
  expect(result.current.alerts.map(alert => alert.kind)).toEqual(['stock']);

});

it('오늘 매출만 바뀌면 원본 재조회 없이 경고를 다시 계산한다', async () => {
  const { result, rerender } = renderHook(({ sales }: { sales: number }) => useHomeAlerts(sales), { initialProps: { sales: 0 } });
  await act(async () => { await result.current.refetch(); });
  const callback = result.current.refetch;
  rerender({ sales: 100 });
  expect(result.current.refetch).toBe(callback);
});

it('실행취소는 본인·매장·키만 되돌리고 이미 해결된 알림을 다시 만들지 않는다', async () => {
  const { result } = renderHook(() => useHomeAlerts());
  await act(async () => { await result.current.refetch(); await result.current.markRead('stock:one'); });
  mockAlerts = [];
  await act(async () => { expect(await result.current.restoreRead('stock:one')).toBe(true); });
  expect(mockRestore).toHaveBeenCalledWith('store', 'a', 'stock:one');
  expect(result.current.alerts).toEqual([]);
});
it('실행취소 저장 실패는 성공으로 처리하지 않는다', async () => {
  const { result } = renderHook(() => useHomeAlerts());
  mockRestore.mockRejectedValueOnce(new Error('permission denied'));
  await act(async () => { await expect(result.current.restoreRead('stock:one')).rejects.toThrow('permission denied'); });
});
it('계정 전환 전 실행취소 응답은 새 계정 조회를 시작하지 않는다', async () => {
  let done!: () => void;
  mockRestore.mockImplementation(() => new Promise<void>(resolve => { done = resolve; }));
  const { result, rerender } = renderHook(() => useHomeAlerts());
  let pending!: Promise<boolean>;
  act(() => { pending = result.current.restoreRead('stock:one'); });
  mockUser = { id: 'b' }; rerender({});
  await act(async () => { done(); expect(await pending).toBe(false); });
  expect(mockGetReads).not.toHaveBeenCalled();
});

it('복원 저장 후 조회 실패는 복원 완료로 표시하지 않고 재시도할 수 있다', async () => {
  const { result } = renderHook(() => useHomeAlerts());
  await act(async () => { await result.current.refetch(); await result.current.markRead('stock:one'); });
  mockGetReads.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { await expect(result.current.restoreRead('stock:one')).rejects.toThrow('홈 알림'); });
  expect(result.current.error).toContain('홈 알림');
  await act(async () => { expect(await result.current.restoreRead('stock:one')).toBe(true); });
  expect(result.current.alerts.map(alert => alert.key)).toContain('stock:one');
});
