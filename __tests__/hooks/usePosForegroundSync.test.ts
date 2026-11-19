import { act, renderHook } from '@testing-library/react-native';
import { AppState, AppStateStatus } from 'react-native';
import { usePosForegroundSync } from '../../lib/hooks/usePosForegroundSync';
const mockSync = jest.fn().mockResolvedValue(undefined);
let mockCallback = mockSync;
jest.mock('../../lib/hooks/useTossSync', () => ({ useTossSync: () => ({ autoSyncOnForeground: mockCallback }) }));
let listener: (next: AppStateStatus) => void;
const remove = jest.fn();
beforeEach(() => {
  jest.clearAllMocks(); mockCallback = mockSync;
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => { listener = callback; return { remove }; });
});
afterEach(() => jest.restoreAllMocks());
it('초기 진입과 실제 복귀마다 한 번 호출하고 같은 active 이벤트는 무시한다', () => {
  const { unmount } = renderHook(() => usePosForegroundSync(true));
  expect(mockSync).toHaveBeenCalledTimes(1);
  act(() => { listener('active'); listener('active'); });
  expect(mockSync).toHaveBeenCalledTimes(1);
  act(() => { listener('background'); listener('active'); listener('active'); });
  expect(mockSync).toHaveBeenCalledTimes(2);
  unmount(); expect(remove).toHaveBeenCalledTimes(1);
});
it('인증 로딩 중에는 실행하지 않고 계정·매장 콜백 변경 때 구독을 교체한다', () => {
  const { rerender } = renderHook<void, { enabled: boolean }>(({ enabled }) => usePosForegroundSync(enabled), { initialProps: { enabled: false } });
  expect(mockSync).not.toHaveBeenCalled();
  expect(AppState.addEventListener).not.toHaveBeenCalled();
  rerender({ enabled: true }); expect(mockSync).toHaveBeenCalledTimes(1);
  const next = jest.fn().mockResolvedValue(undefined); mockCallback = next;
  rerender({ enabled: true });
  expect(remove).toHaveBeenCalledTimes(1); expect(next).toHaveBeenCalledTimes(1);
  act(() => { listener('background'); listener('active'); });
  expect(next).toHaveBeenCalledTimes(2); expect(mockSync).toHaveBeenCalledTimes(1);
});
it('백그라운드에서 준비되면 복귀할 때까지 실행을 기다린다', () => {
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
  renderHook(() => usePosForegroundSync(true));
  expect(mockSync).not.toHaveBeenCalled();
  act(() => listener('active')); expect(mockSync).toHaveBeenCalledTimes(1);
});
