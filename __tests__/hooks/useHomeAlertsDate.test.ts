import { act, renderHook } from '@testing-library/react-native';
import { useHomeAlerts } from '../../lib/hooks/useHomeAlerts';
import { notifyManager } from '@tanstack/react-query';
import { queryClient as mockSharedQueryClient } from '../../lib/query/client';
// 훅이 공용 쿼리 캐시를 쓰므로 테스트마다 비우고, 화면 알림을 동기로 받아 act 안에서 반영되게 한다.
notifyManager.setScheduler(callback => callback());
beforeEach(() => { mockSharedQueryClient.clear(); });
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
const mockStore = { id: 'store', toss_merchant_id: 'merchant' };
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' }, store: mockStore }) }));
jest.mock('../../lib/services/homeAlerts', () => ({
 ...jest.requireActual('../../lib/services/homeAlerts'),
 getHomeAlertStock: jest.fn().mockResolvedValue([]),
 hasMonthlyFixedExpense: jest.fn().mockResolvedValue(false),
 getHomeAlertReads: jest.fn().mockResolvedValue([]),
}));
it('월 경계 후 오늘 매출 갱신은 새 달 알림을 보여야 한다', async () => {
 jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-30T14:59:59Z'));
 const view = renderHook(({ sales }: { sales: number }) => {
  // 2026-11-24: 홈 패널처럼 active로 자동 조회한다(날짜가 바뀌면 새 키를 받는다).
  const result = useHomeAlerts(sales, undefined, true, true);
  return result;
 }, { initialProps: { sales: 0 } });
 await act(async () => {});
 expect(view.result.current.alerts.some(a => a.key === 'fixedExpenseMissing:2026-11')).toBe(true);
 jest.setSystemTime(new Date('2026-11-30T15:00:01Z'));
 view.rerender({ sales: 100 });
 await act(async () => {});
 expect(view.result.current.alerts.some(a => a.key === 'fixedExpenseMissing:2026-12')).toBe(true);
 jest.useRealTimers();
});

it('매출 변경 없이 한국 자정을 지나도 새 월·날짜의 읽음 키를 조회한다', async () => {
 jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-30T14:59:59Z'));
 const services = require('../../lib/services/homeAlerts');
 services.getHomeAlertReads.mockClear(); services.hasMonthlyFixedExpense.mockClear();
 const view = renderHook(() => {
  const result = useHomeAlerts(0, undefined, true, true);
  return result;
 });
 await act(async () => {});
 await act(async () => { jest.advanceTimersByTime(1000); });
 expect(services.hasMonthlyFixedExpense).toHaveBeenLastCalledWith('store', '2026-12');
 expect(services.getHomeAlertReads.mock.calls.at(-1)[2]).toContain('tossNotSynced:2026-12-01');
 expect(view.result.current.alerts.some(a => a.key.startsWith('monthClose:2026-11'))).toBe(false);
 view.unmount(); jest.useRealTimers();
});
it('같은 한국 날짜의 매출 변경만으로 원본을 재조회하지 않는다', async () => {
 jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-17T10:00:00Z'));
 const services = require('../../lib/services/homeAlerts');
 services.getHomeAlertStock.mockClear(); services.getHomeAlertReads.mockClear();
 const view = renderHook(({ sales }: { sales: number }) => {
  const result = useHomeAlerts(sales, undefined, true, true);
  return result;
 }, { initialProps: { sales: 0 } });
 await act(async () => {});
 const reads = services.getHomeAlertReads.mock.calls.length;
 view.rerender({ sales: 100 }); await act(async () => {});
 expect(services.getHomeAlertStock).toHaveBeenCalledTimes(1);
 expect(services.getHomeAlertReads).toHaveBeenCalledTimes(reads);
 view.unmount(); jest.useRealTimers();
});
