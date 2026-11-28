/**
 * 재진입 캐시 계약(docs/앱속도-재진입캐시-TanStack전략-2026-11-24.md 4-1장).
 * mock 서비스 호출 횟수로 확인한다. 실제 서버·네이티브 화면 검증을 대체하지 않는다.
 */
import { act, renderHook } from '@testing-library/react-native';
import { queryClient, invalidateStoreData, clearQueryData } from '../../lib/query/client';
import { STALE_TIME } from '../../lib/query/staleTimes';
import { useRefreshOnReturn } from '../../lib/query/useRefreshOnReturn';
import { useHomeWorkflow } from '../../lib/hooks/useHomeWorkflow';
import { useAttendanceToday } from '../../lib/hooks/useAttendanceToday';
import { usePurchases } from '../../lib/hooks/usePurchases';
import { useDailyChecklistSummary } from '../../lib/hooks/useDailyChecklistSummary';
import { usePayroll } from '../../lib/hooks/usePayroll';

let mockStore = { id: 'store-a' };
const mockWorkflow = jest.fn();
const mockPunches = jest.fn();
const mockSchedule = jest.fn();
const mockPurchases = jest.fn();
const mockItems = jest.fn();
const mockLogs = jest.fn();
const mockPayroll = jest.fn();
const mockFocusCallbacks = new Set<() => void>();

jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({
  user: { id: 'user-a' }, store: mockStore, permissionRevision: '1', devPreviewMode: 'self', currentRole: 'admin',
  canManageStore: true, access: { is_owner: true },
}) }));
jest.mock('../../lib/query', () => ({ ...jest.requireActual('../../lib/query/client'), useQueryScope: () => 'scope-a' }));
jest.mock('../../lib/hooks/usePreviewWriteGuard', () => ({ usePreviewWriteGuard: () => ({ assertCanWrite: () => undefined }) }));
jest.mock('../../lib/services/homeWorkflow', () => ({ getHomeWorkflow: (...args: unknown[]) => mockWorkflow(...args) }));
jest.mock('../../lib/services/attendance', () => ({ getAttendancePunches: (...args: unknown[]) => mockPunches(...args) }));
jest.mock('../../lib/services/schedule', () => ({ getEmployeeSchedule: (...args: unknown[]) => mockSchedule(...args) }));
jest.mock('../../lib/services/purchases', () => ({ getPurchasesWithItemCountsByMonth: (...args: unknown[]) => mockPurchases(...args) }));
jest.mock('../../lib/services/cleaning', () => ({
  listCleaningItems: (...args: unknown[]) => mockItems(...args), listCleaningLogsByDate: (...args: unknown[]) => mockLogs(...args),
}));
const mockSaveDeductions = jest.fn();
jest.mock('../../lib/services/payroll', () => ({ getPayrollByMonth: (...args: unknown[]) => mockPayroll(...args), updatePayrollDeductions: (...args: unknown[]) => mockSaveDeductions(...args), probationDayFactor: () => () => 1 }));
// 포커스 효과는 등록 때 한 번(첫 포커스) 실행하고, focusAgain()이 스택 복귀를 흉내 낸다.
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => void) => {
  const React = require('react');
  React.useEffect(() => { mockFocusCallbacks.add(callback); callback(); return () => { mockFocusCallbacks.delete(callback); }; }, [callback]);
} }));
const focusAgain = () => act(async () => { mockFocusCallbacks.forEach(callback => callback()); });
// TanStack Query는 setTimeout(0)으로 화면 갱신을 알린다. 가짜 타이머에서는 0ms 타이머를 함께 흘려보낸다.
const settle = () => act(async () => { for (let i = 0; i < 3; i += 1) { await Promise.resolve(); jest.advanceTimersByTime(0); } });
const advance = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });

beforeEach(() => {
  jest.useFakeTimers();
  queryClient.clear();
  mockFocusCallbacks.clear();
  mockStore = { id: 'store-a' };
  mockWorkflow.mockReset().mockResolvedValue(null);
  mockPunches.mockReset().mockResolvedValue({ status: 'success', data: { rows: [], nextOffset: null } });
  mockSchedule.mockReset().mockResolvedValue([]);
  mockPurchases.mockReset().mockResolvedValue([]);
  mockItems.mockReset().mockResolvedValue([]);
  mockLogs.mockReset().mockResolvedValue([]);
  mockPayroll.mockReset().mockResolvedValue([]);
});
afterEach(() => { queryClient.clear(); jest.useRealTimers(); });

describe('탭 전환(enabled: active)', () => {
  it('재사용 시간 안의 탭 재진입은 다시 요청하지 않고, 지난 뒤에는 한 번만 받는다', async () => {
    const view = renderHook(({ active }: { active: boolean }) => useHomeWorkflow(active), { initialProps: { active: true } });
    await settle();
    expect(mockWorkflow).toHaveBeenCalledTimes(1);
    view.rerender({ active: false }); view.rerender({ active: true });
    await settle();
    expect(mockWorkflow).toHaveBeenCalledTimes(1);
    view.rerender({ active: false });
    await advance(STALE_TIME.config + 1);
    view.rerender({ active: true });
    await settle();
    expect(mockWorkflow).toHaveBeenCalledTimes(2);
  });

  it('숨은 탭에서 무효화된 자료는 탭에 들어올 때 받고, 다른 매장 무효화는 무시한다', async () => {
    const view = renderHook(({ active }: { active: boolean }) => usePurchases('2026-11', active), { initialProps: { active: true } });
    await settle();
    expect(mockPurchases).toHaveBeenCalledTimes(1);
    await act(async () => { await invalidateStoreData('store-b', ['purchases']); });
    expect(mockPurchases).toHaveBeenCalledTimes(1);
    view.rerender({ active: false });
    await act(async () => { await invalidateStoreData('store-a', ['purchases']); });
    expect(mockPurchases).toHaveBeenCalledTimes(1);
    view.rerender({ active: true });
    await settle();
    expect(mockPurchases).toHaveBeenCalledTimes(2);
  });

  it('활성 탭에서 저장 무효화가 오면 바로 한 번 받는다', async () => {
    renderHook(() => usePayroll('2026-11', true));
    await settle();
    expect(mockPayroll).toHaveBeenCalledTimes(1);
    await act(async () => { await invalidateStoreData('store-a'); });
    expect(mockPayroll).toHaveBeenCalledTimes(2);
  });

  it('월을 바꾸면 이전 달 목록을 보여주지 않는다(keepPreviousData 쓰지 않음)', async () => {
    mockPurchases.mockResolvedValueOnce([{ id: 'november' }]).mockImplementationOnce(() => new Promise(() => {}));
    const view = renderHook(({ month }: { month: string }) => usePurchases(month), { initialProps: { month: '2026-11' } });
    await settle();
    expect(view.result.current.purchases).toEqual([{ id: 'november' }]);
    view.rerender({ month: '2026-10' });
    await settle();
    expect(view.result.current.purchases).toEqual([]);
    expect(view.result.current.loading).toBe(true);
  });

  // 저장 결과를 모를 때(무효화가 실행되지 않음) 확인 창이 5분 캐시의 저장 전 목록을 보여주면 중복 저장으로 이어진다.
  it('결과 확인용 reloadFresh는 캐시된 저장 전 목록을 버리고 로딩 뒤 최신 목록만 보여준다', async () => {
    mockPurchases.mockResolvedValueOnce([{ id: 'before-save' }]);
    renderHook(() => usePurchases('2026-11'));
    await settle();
    let resolveLatest: (rows: unknown[]) => void = () => undefined;
    mockPurchases.mockImplementationOnce(() => new Promise(resolve => { resolveLatest = resolve; }));
    const check = renderHook(({ open }: { open: boolean }) => usePurchases('2026-11', open), { initialProps: { open: false } });
    act(() => { check.result.current.reloadFresh(); check.rerender({ open: true }); });
    await settle();
    expect(check.result.current.purchases).toEqual([]);
    expect(check.result.current.loading).toBe(true);
    await act(async () => { resolveLatest([{ id: 'before-save' }, { id: 'saved' }]); });
    await settle();
    expect(check.result.current.purchases).toEqual([{ id: 'before-save' }, { id: 'saved' }]);
  });

  it('신원이 바뀌어 캐시를 비우면 이전 값을 보여주지 않고 다시 요청한다', async () => {
    mockPurchases.mockResolvedValueOnce([{ id: 'old' }]).mockImplementationOnce(() => new Promise(() => {}));
    const view = renderHook(() => usePurchases('2026-11'));
    await settle();
    await act(async () => { await clearQueryData(); });
    view.rerender({});
    await settle();
    expect(view.result.current.purchases).toEqual([]);
    expect(mockPurchases).toHaveBeenCalledTimes(2);
  });
});

describe('스택 복귀(useRefreshOnReturn)', () => {
  function useScreen(active: boolean) {
    const workflow = useHomeWorkflow(active);
    useRefreshOnReturn({ active, storeId: mockStore.id, domains: ['home-workflow'] });
    return workflow;
  }

  it('첫 포커스는 조회를 더하지 않는다', async () => {
    renderHook(() => useScreen(true));
    await settle();
    expect(mockWorkflow).toHaveBeenCalledTimes(1);
  });

  it('재사용 시간 안 복귀는 0회, 지난 뒤 복귀는 1회', async () => {
    renderHook(() => useScreen(true));
    await settle();
    await focusAgain();
    expect(mockWorkflow).toHaveBeenCalledTimes(1);
    await advance(STALE_TIME.config + 1);
    await focusAgain();
    expect(mockWorkflow).toHaveBeenCalledTimes(2);
  });

  it('비활성 탭은 복귀해도 받지 않는다', async () => {
    const view = renderHook(({ active }: { active: boolean }) => useScreen(active), { initialProps: { active: true } });
    await settle();
    view.rerender({ active: false });
    await advance(STALE_TIME.config + 1);
    await focusAgain();
    expect(mockWorkflow).toHaveBeenCalledTimes(1);
  });
});

describe('홈 상태·출퇴근', () => {
  it('첫 마운트에서 출퇴근·스케줄을 한 번씩만 받는다(포커스 중복 없음)', async () => {
    renderHook(() => useAttendanceToday('employee-a', true));
    await settle();
    expect(mockPunches).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('출퇴근은 1분, 스케줄은 30분 재사용한다', async () => {
    const view = renderHook(({ active }: { active: boolean }) => useAttendanceToday('employee-a', active), { initialProps: { active: true } });
    await settle();
    view.rerender({ active: false });
    await advance(STALE_TIME.homeStatus + 1);
    view.rerender({ active: true });
    await settle();
    expect(mockPunches).toHaveBeenCalledTimes(2);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('당겨서 새로고침은 재사용 시간 안이어도 다시 받는다', async () => {
    const view = renderHook(() => useAttendanceToday('employee-a', true));
    await settle();
    await act(async () => { await view.result.current.refetch(); });
    expect(mockPunches).toHaveBeenCalledTimes(2);
  });

  it('내 QR 화면의 5초 확인이 홈 출퇴근 카드와 같은 캐시를 갱신한다', async () => {
    const home = renderHook(() => useAttendanceToday('employee-a', false));
    await settle();
    expect(mockPunches).toHaveBeenCalledTimes(0);
    const clockIn = { id: 'in', kind: 'clock_in', event_order: 1, punched_at: new Date().toISOString(), work_date: new Date(Date.now() + 32_400_000).toISOString().slice(0, 10) };
    mockPunches.mockResolvedValue({ status: 'success', data: { rows: [clockIn], nextOffset: null } });
    const qr = renderHook(() => useAttendanceToday('employee-a', true, 0, 5_000));
    await settle();
    await advance(5_000);
    expect(mockPunches.mock.calls.length).toBeGreaterThanOrEqual(2);
    qr.unmount();
    home.rerender({});
    expect(home.result.current.start?.id).toBe('in');
  });

  it('체크리스트 요약은 1분 안 재진입에 다시 받지 않는다', async () => {
    const view = renderHook(({ active }: { active: boolean }) => useDailyChecklistSummary(active, 0), { initialProps: { active: true } });
    await settle();
    view.rerender({ active: false }); view.rerender({ active: true });
    await settle();
    expect(mockItems).toHaveBeenCalledTimes(1);
  });
});

describe('당겨서 새로고침·저장 반영', () => {
  it('홈 업무 구성은 재사용 시간 안이어도 당겨서 새로고침하면 다시 받는다', async () => {
    const view = renderHook(({ key }: { key: number }) => useHomeWorkflow(true, key), { initialProps: { key: 0 } });
    await settle();
    view.rerender({ key: 1 });
    await settle();
    expect(mockWorkflow).toHaveBeenCalledTimes(2);
  });

  it('아직 받지 않은 월에 급여를 저장해도 한 건짜리 목록·합계를 확정값처럼 만들지 않는다', async () => {
    const saved = { id: 'p', employee_id: 'e', store_id: 'store-a', year_month: '2026-11', gross: 1000, net_pay: 900 };
    mockSaveDeductions.mockResolvedValue(saved);
    const view = renderHook(() => usePayroll('2026-11', false));
    await act(async () => { await view.result.current.saveDeductions(saved as never, {} as never); });
    expect(view.result.current.payrolls).toEqual([]);
    expect(view.result.current.totalLaborCost).toBeNull();
  });
});
