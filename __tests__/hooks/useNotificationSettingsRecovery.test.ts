import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useNotificationSettings } from '../../lib/hooks/useNotificationSettings';
const mockRead = jest.fn(), mockWrite = jest.fn();
let mockStoreId = 's1';
let mockUserId: string | null = 'u';
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: mockStoreId }, user: mockUserId ? { id: mockUserId } : null }) }));
jest.mock('../../lib/services/notifications', () => ({ getNotificationSettings: (...args: unknown[]) => mockRead(...args), setNotificationSetting: (...args: unknown[]) => mockWrite(...args) }));
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { resolve, promise }; }
beforeEach(() => { jest.clearAllMocks(); mockStoreId = 's1'; mockUserId = 'u'; mockRead.mockReset().mockResolvedValue({ low: true }); mockWrite.mockReset().mockResolvedValue(undefined); });
it('조회 실패를 기본 설정으로 표시하지 않고 재조회로 복구한다', async () => {
  mockRead.mockRejectedValueOnce(new Error('offline'));
  const { result } = renderHook(() => useNotificationSettings());
  await act(async () => { await result.current.refetch(); });
  expect(result.current.ready).toBe(false); expect(result.current.error).toBeTruthy();
  await act(async () => { await result.current.toggle('low', false); });
  expect(mockWrite).not.toHaveBeenCalled();
  await act(async () => { await result.current.refetch(); });
  expect(result.current).toMatchObject({ ready: true, error: null, settings: { low: true } });
});
it('저장 실패 시 이전값을 복구하고 재조회 전 추가 저장을 막는다', async () => {
  const { result } = renderHook(() => useNotificationSettings());
  await act(async () => { await result.current.refetch(); });
  mockWrite.mockRejectedValueOnce(new Error('offline'));
  await act(async () => { await result.current.toggle('low', false); });
  expect(result.current).toMatchObject({ settings: { low: true }, ready: false, savingKey: null });
  expect(result.current.error).toContain('다시 불러와');
  await act(async () => { await result.current.toggle('low', false); });
  expect(mockWrite).toHaveBeenCalledTimes(1);
});
it('같은 틱의 토글 연타도 하나만 저장한다', async () => {
  const pending = deferred<void>(); mockWrite.mockReturnValueOnce(pending.promise);
  const { result } = renderHook(() => useNotificationSettings());
  await act(async () => { await result.current.refetch(); });
  let write!: Promise<void>;
  act(() => { write = result.current.toggle('low', false); void result.current.toggle('low', true); });
  expect(mockWrite).toHaveBeenCalledTimes(1); expect(result.current.savingKey).toBe('low');
  await act(async () => { pending.resolve(); await write; });
  expect(result.current.settings.low).toBe(false);
});
it('매장 변경 후 이전 조회 응답은 새 매장 상태를 바꾸지 않는다', async () => {
  const oldRead = deferred<Record<string, boolean>>(); mockRead.mockReturnValueOnce(oldRead.promise);
  const { result, rerender } = renderHook(() => useNotificationSettings());
  let first!: Promise<void>; act(() => { first = result.current.refetch(); });
  mockStoreId = 's2'; rerender({});
  await act(async () => { await result.current.refetch(); });
  await act(async () => { oldRead.resolve({ low: false }); await first; });
  expect(result.current.settings.low).toBe(true);
});
it('가장 최근 재조회만 반영한다', async () => {
  const old = deferred<Record<string, boolean>>(); mockRead.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ low: false });
  const { result } = renderHook(() => useNotificationSettings());
  let first!: Promise<void>; act(() => { first = result.current.refetch(); });
  await act(async () => { await result.current.refetch(); });
  await act(async () => { old.resolve({ low: true }); await first; });
  await waitFor(() => expect(result.current.settings.low).toBe(false));
});

it('이전 매장 저장의 지연 실패가 새 매장의 조회 결과를 되돌리지 않는다', async () => {
  let reject!: (error: Error) => void;
  mockWrite.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
  const { result, rerender } = renderHook(() => useNotificationSettings());
  await act(async () => { await result.current.refetch(); });
  let write!: Promise<void>; act(() => { write = result.current.toggle('low', false); });
  mockStoreId = 's2'; rerender({});
  mockRead.mockResolvedValueOnce({ low: false });
  await act(async () => { await result.current.refetch(); });
  await act(async () => { reject(new Error('old store failed')); await write; });
  expect(result.current).toMatchObject({ ready: true, error: null, savingKey: null, settings: { low: false } });
});
it('재조회 직후 이전 렌더의 토글 함수를 호출해도 저장하지 않는다', async () => {
  const { result } = renderHook(() => useNotificationSettings());
  await act(async () => { await result.current.refetch(); });
  const oldToggle = result.current.toggle;
  const read = deferred<Record<string, boolean>>(); mockRead.mockReturnValueOnce(read.promise);
  let pending!: Promise<void>;
  act(() => { pending = result.current.refetch(); void oldToggle('low', false); });
  expect(mockWrite).not.toHaveBeenCalled();
  await act(async () => { read.resolve({ low: true }); await pending; });
});
it('저장 여부가 불명인 오류 후 오래된 토글 함수로 재저장하지 않는다', async () => {
  const { result } = renderHook(() => useNotificationSettings());
  await act(async () => { await result.current.refetch(); });
  const oldToggle = result.current.toggle; mockWrite.mockRejectedValueOnce(new Error('lost response'));
  await act(async () => { await oldToggle('low', false); await oldToggle('low', false); });
  expect(mockWrite).toHaveBeenCalledTimes(1); expect(result.current.ready).toBe(false);
});
it('저장 응답 유실 뒤 재조회에서 서버에 반영된 값을 복원한다', async () => {
  const { result } = renderHook(() => useNotificationSettings());
  await act(async () => { await result.current.refetch(); });
  mockWrite.mockRejectedValueOnce(new Error('response lost'));
  await act(async () => { await result.current.toggle('low', false); });
  mockRead.mockResolvedValueOnce({ low: false });
  await act(async () => { await result.current.refetch(); });
  expect(result.current).toMatchObject({ ready: true, error: null, settings: { low: false } });
  expect(mockWrite).toHaveBeenCalledTimes(1);
});
it('매장 미선택 상태는 무한 로딩이나 기본값 목록으로 표시하지 않는다', async () => {
  mockStoreId = ''; const { result } = renderHook(() => useNotificationSettings());
  await act(async () => { await result.current.refetch(); });
  expect(result.current).toMatchObject({ loading: false, ready: false, settings: {} });
  expect(mockRead).not.toHaveBeenCalled(); expect(mockWrite).not.toHaveBeenCalled();
});
it('로그아웃하면 설정을 숨기고 이전 함수로 저장하지 않는다', async () => {
  const { result, rerender } = renderHook(() => useNotificationSettings());
  await act(async () => { await result.current.refetch(); }); const oldToggle = result.current.toggle;
  mockUserId = null; rerender({});
  await act(async () => { await oldToggle('low', false); await result.current.refetch(); });
  expect(result.current).toMatchObject({ loading: false, ready: false, settings: {} });
  expect(mockWrite).not.toHaveBeenCalled(); expect(mockRead).toHaveBeenCalledTimes(1);
});
it('저장 중 재조회가 낙관 표시를 덮어쓰지 않는다', async () => {
  const response = deferred<void>(); mockWrite.mockReturnValueOnce(response.promise);
  const { result } = renderHook(() => useNotificationSettings());
  await act(async () => { await result.current.refetch(); });
  let pending!: Promise<void>; act(() => { pending = result.current.toggle('low', false); });
  await act(async () => { await result.current.refetch(); }); expect(mockRead).toHaveBeenCalledTimes(1);
  await act(async () => { response.resolve(); await pending; });
  expect(result.current).toMatchObject({ settings: { low: false }, ready: true, savingKey: null, error: null });
});
it('같은 매장에서 계정이 바뀌어도 이전 조회는 새 계정 설정을 덮지 않는다', async () => {
  const old = deferred<Record<string, boolean>>(); mockRead.mockReturnValueOnce(old.promise);
  const { result, rerender } = renderHook(() => useNotificationSettings());
  let pending!: Promise<void>; act(() => { pending = result.current.refetch(); });
  mockUserId = 'another'; rerender({}); mockRead.mockResolvedValueOnce({ low: false });
  await act(async () => { await result.current.refetch(); });
  await act(async () => { old.resolve({ low: true }); await pending; });
  expect(result.current).toMatchObject({ settings: { low: false }, ready: true });
});
