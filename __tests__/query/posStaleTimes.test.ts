/**
 * POS 매출 요약 재사용 시간 계약(docs/intent/POS매출-재사용시간.md).
 * mock 서비스 호출 횟수로 확인한다. 실제 서버·네이티브 화면 검증을 대체하지 않는다.
 */
import { act, renderHook } from '@testing-library/react-native';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { usePosAnalytics } from '../../lib/hooks/usePosAnalytics';
import { queryClient, invalidateStoreData } from '../../lib/query/client';
import { STALE_TIME, posRangeStaleTime } from '../../lib/query/staleTimes';

jest.mock('../../lib/query/legacyPosCache', () => ({ clearLegacyPosCache: jest.fn() }));
const mockSummary = jest.fn();
const mockItems = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({
  store: { id: 'store-a', closing_time: '23:00', toss_merchant_id: 'merchant' },
  currentRole: 'admin', canManageStore: true, devPreviewMode: 'self', canReadFinancials: true,
}) }));
jest.mock('../../lib/query', () => ({ ...jest.requireActual('../../lib/query/client'), useQueryScope: () => 'scope-a' }));
jest.mock('../../lib/services/posAnalytics', () => ({
  ...jest.requireActual('../../lib/services/posAnalytics'),
  getDailySummariesByRange: (...args: unknown[]) => mockSummary(...args),
  getDailyItems: (...args: unknown[]) => mockItems(...args),
}));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/services/tossplace', () => ({ fetchTossOrders: jest.fn() }));
jest.mock('../../lib/services/tossSync', () => ({ getTossMerchantId: jest.fn(), hasPosOrders: jest.fn(), savePosOrders: jest.fn() }));

const MINUTE = 60_000;
const NOW = new Date('2026-11-17T05:00:00Z');
// 이번 달(11월)과 지난 달(10월) 월 범위. 마감 23:00 기준 영업일 경계다.
const NOV = { from: new Date('2026-11-01T14:00:00Z'), to: new Date('2026-12-01T14:00:00Z') };
const OCT = { from: new Date('2026-10-01T14:00:00Z'), to: new Date('2026-11-01T14:00:00Z') };
const rows = [{ date: '2026-11-16', totalAmount: 100, orderCount: 1 }];
const advance = (ms: number) => jest.setSystemTime(new Date(Date.now() + ms));

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  queryClient.clear();
  mockSummary.mockReset().mockResolvedValue(rows);
  mockItems.mockReset().mockResolvedValue([]);
});
afterEach(() => { queryClient.clear(); jest.useRealTimers(); });

describe('시간표 값', () => {
  it('오늘 매출 5분, 이번 달 범위 5분, 지난 달 범위 30분', () => {
    expect(STALE_TIME.posToday).toBe(5 * MINUTE);
    expect(STALE_TIME.posCurrent).toBe(5 * MINUTE);
    expect(STALE_TIME.posPast).toBe(30 * MINUTE);
  });
  it('조회 범위로 이번 달/지난 달을 판정한다', () => {
    const now = NOW.getTime();
    expect(posRangeStaleTime(NOV.from, NOV.to, now)).toBe(STALE_TIME.posCurrent);
    expect(posRangeStaleTime(OCT.from, OCT.to, now)).toBe(STALE_TIME.posPast);
    // 이번 달의 지난 영업일 하루(품목)도 이번 달이다.
    expect(posRangeStaleTime('2026-11-02T14:00:00Z', '2026-11-03T14:00:00Z', now)).toBe(STALE_TIME.posCurrent);
    // 10월 마지막 영업일(10/31 23:00 KST 시작)은 지난 달이다.
    expect(posRangeStaleTime('2026-10-31T14:00:00Z', '2026-11-01T14:00:00Z', now)).toBe(STALE_TIME.posPast);
    // 새 달 첫 영업일 경계 전에는 지난 달 범위가 아직 진행 중이므로 이번 달 기준을 쓴다.
    expect(posRangeStaleTime(OCT.from, OCT.to, new Date('2026-11-01T10:00:00Z').getTime())).toBe(STALE_TIME.posCurrent);
  });
});

describe('오늘 매출(useTossSync)', () => {
  it('5분 안 재진입은 다시 요청하지 않고, 5분이 지나면 다시 받는다', async () => {
    const first = renderHook(useTossSync);
    await act(async () => { await first.result.current.loadTodaySales(); });
    first.unmount();
    advance(4 * MINUTE);
    const again = renderHook(useTossSync);
    await act(async () => { await again.result.current.loadTodaySales(); });
    expect(mockSummary).toHaveBeenCalledTimes(1);
    advance(MINUTE + 1);
    await act(async () => { await again.result.current.loadTodaySales(); });
    expect(mockSummary).toHaveBeenCalledTimes(2);
  });
  it('강제 조회는 재사용 시간 안에도 항상 다시 받는다', async () => {
    const view = renderHook(useTossSync);
    await act(async () => { await view.result.current.loadTodaySales(); });
    await act(async () => { await view.result.current.loadTodaySales(true); });
    expect(mockSummary).toHaveBeenCalledTimes(2);
  });
  it('동기화 뒤 pos 무효화는 재사용 시간 안에도 바로 반영된다', async () => {
    const view = renderHook(useTossSync);
    await act(async () => { await view.result.current.loadTodaySales(); });
    mockSummary.mockResolvedValue([{ ...rows[0], totalAmount: 300 }]);
    await act(async () => { await invalidateStoreData('store-a', ['pos', 'financial']); });
    await act(async () => { await view.result.current.loadTodaySales(); });
    expect(mockSummary).toHaveBeenCalledTimes(2);
    expect(view.result.current.todaySales).toBe(300);
  });
});

describe('월 일별 요약(usePosAnalytics)', () => {
  it('이번 달 범위는 5분 동안 재사용하고 그 뒤 다시 받는다', async () => {
    const view = renderHook(() => usePosAnalytics(NOV.from, NOV.to));
    await act(async () => { await view.result.current.fetchSummariesByRange(NOV.from, NOV.to); });
    advance(4 * MINUTE);
    await act(async () => { await view.result.current.fetchSummariesByRange(NOV.from, NOV.to); });
    expect(mockSummary).toHaveBeenCalledTimes(1);
    advance(MINUTE + 1);
    await act(async () => { await view.result.current.fetchSummariesByRange(NOV.from, NOV.to); });
    expect(mockSummary).toHaveBeenCalledTimes(2);
  });
  it('지난 달 범위는 30분 동안 재사용하고 그 뒤 다시 받는다', async () => {
    const view = renderHook(() => usePosAnalytics(OCT.from, OCT.to));
    await act(async () => { await view.result.current.fetchSummariesByRange(OCT.from, OCT.to); });
    advance(29 * MINUTE);
    await act(async () => { await view.result.current.fetchSummariesByRange(OCT.from, OCT.to); });
    expect(mockSummary).toHaveBeenCalledTimes(1);
    advance(MINUTE + 1);
    await act(async () => { await view.result.current.fetchSummariesByRange(OCT.from, OCT.to); });
    expect(mockSummary).toHaveBeenCalledTimes(2);
  });
  it('조회 버튼(force)은 재사용 시간 안에도 항상 다시 받는다', async () => {
    const view = renderHook(() => usePosAnalytics(OCT.from, OCT.to));
    await act(async () => { await view.result.current.fetchSummariesByRange(OCT.from, OCT.to); });
    await act(async () => { await view.result.current.fetchSummariesByRange(OCT.from, OCT.to, true); });
    expect(mockSummary).toHaveBeenCalledTimes(2);
  });
  it('동기화 뒤 pos 무효화는 지난 달 범위에도 바로 반영된다', async () => {
    const view = renderHook(() => usePosAnalytics(OCT.from, OCT.to));
    await act(async () => { await view.result.current.fetchSummariesByRange(OCT.from, OCT.to); });
    await act(async () => { await invalidateStoreData('store-a', ['pos', 'financial']); });
    await act(async () => { await view.result.current.fetchSummariesByRange(OCT.from, OCT.to); });
    expect(mockSummary).toHaveBeenCalledTimes(2);
  });
});

describe('품목별 매출(usePosAnalytics)', () => {
  const novDay = ['2026-11-16T14:00:00.000Z', '2026-11-17T14:00:00.000Z'] as const;
  const octDay = ['2026-10-16T14:00:00.000Z', '2026-10-17T14:00:00.000Z'] as const;
  it('이번 달 영업일은 5분, 지난 달 영업일은 30분 동안 재사용한다', async () => {
    const view = renderHook(() => usePosAnalytics());
    await act(async () => { await view.result.current.fetchItems(...novDay); });
    await act(async () => { await view.result.current.fetchItems(...octDay); });
    advance(4 * MINUTE);
    await act(async () => { await view.result.current.fetchItems(...novDay); });
    await act(async () => { await view.result.current.fetchItems(...octDay); });
    expect(mockItems).toHaveBeenCalledTimes(2);
    advance(2 * MINUTE);
    await act(async () => { await view.result.current.fetchItems(...novDay); });
    await act(async () => { await view.result.current.fetchItems(...octDay); });
    expect(mockItems).toHaveBeenCalledTimes(3);
    advance(25 * MINUTE);
    await act(async () => { await view.result.current.fetchItems(...octDay); });
    expect(mockItems).toHaveBeenCalledTimes(4);
  });
  it('동기화 뒤 pos 무효화는 바로 반영된다', async () => {
    const view = renderHook(() => usePosAnalytics());
    await act(async () => { await view.result.current.fetchItems(...octDay); });
    await act(async () => { await invalidateStoreData('store-a', ['pos', 'financial']); });
    await act(async () => { await view.result.current.fetchItems(...octDay); });
    expect(mockItems).toHaveBeenCalledTimes(2);
  });
});
