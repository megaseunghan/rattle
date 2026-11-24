import { act, renderHook } from '@testing-library/react-native';
import { useHomeWorkflow } from '../../lib/hooks/useHomeWorkflow';
import { queryClient, invalidateStoreData } from '../../lib/query/client';
import { STALE_TIME } from '../../lib/query/staleTimes';
const mockGet = jest.fn().mockResolvedValue(null);
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: 'a' } }) }));
jest.mock('../../lib/query', () => ({ ...jest.requireActual('../../lib/query/client'), useQueryScope: () => 'u' }));
jest.mock('../../lib/services/homeWorkflow', () => ({ getHomeWorkflow: (...args: unknown[]) => mockGet(...args) }));
beforeEach(() => { jest.useFakeTimers(); queryClient.clear(); mockGet.mockClear(); });
afterEach(() => { queryClient.clear(); jest.useRealTimers(); });
// 2026-11-24 재진입 캐시: 예전에는 탭 재진입마다 다시 받았다. 이제 설정류는 30분 재사용하고 저장 무효화로만 즉시 갱신한다.
it('열어 둔 홈은 자동 폴링하지 않고, 30분 안 탭 재진입은 다시 받지 않으며 저장 무효화 때 갱신한다', async () => {
 const view = renderHook(({ active }: { active: boolean }) => useHomeWorkflow(active), { initialProps: { active: true } });
 await act(async () => {});
 const initial = mockGet.mock.calls.length;
 await act(async () => { jest.advanceTimersByTime(120_000); });
 expect(mockGet).toHaveBeenCalledTimes(initial);
 view.rerender({ active: false }); view.rerender({ active: true });
 await act(async () => {});
 expect(mockGet).toHaveBeenCalledTimes(initial);
 view.rerender({ active: false });
 await act(async () => { jest.advanceTimersByTime(STALE_TIME.config); });
 view.rerender({ active: true });
 await act(async () => {});
 expect(mockGet.mock.calls.length).toBeGreaterThan(initial);
 const returning = mockGet.mock.calls.length;
 await act(async () => { await invalidateStoreData('a', ['home-workflow']); });
 expect(mockGet.mock.calls.length).toBeGreaterThan(returning);
});
