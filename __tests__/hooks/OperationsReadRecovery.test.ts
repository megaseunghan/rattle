import { act, renderHook, waitFor } from '@testing-library/react-native';
import { notifyManager } from '@tanstack/react-query';
import { clearQueryData } from '../../lib/query/client';
import { useManualSales } from '../../lib/hooks/useManualSales';
import { useRequestApprovals } from '../../lib/hooks/useRequestApprovals';
const mockSales = jest.fn(), mockDelete = jest.fn(), mockRequests = jest.fn(), mockReview = jest.fn();
let mockStore = 's';
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({ store: { id: mockStore }, user: { id: 'u' }, realRole: 'admin', currentRole: 'admin', devPreviewMode: 'self' }) }));
jest.mock('../../lib/services/manualSales', () => ({ getManualSalesByMonth: (...a:unknown[]) => mockSales(...a), deleteManualSale: (...a:unknown[]) => mockDelete(...a) }));
jest.mock('../../lib/services/schedule', () => ({ getPendingScheduleRequests: (...a:unknown[]) => mockRequests(...a), reviewScheduleRequest: (...a:unknown[]) => mockReview(...a) }));
const sale = { id: 'sale', store_id: 's', date: '2026-10-01', cash_amount: 100, card_amount: 200 };
const request = { id: 'request', store_id: 's', employee_id: 'e', days: [] } as any;
function deferred() { let resolve!:(v:any)=>void; const promise = new Promise<any>(yes=>{resolve=yes;}); return {promise,resolve}; }
beforeAll(() => notifyManager.setNotifyFunction(callback => { act(() => callback()); }));
afterAll(() => notifyManager.setNotifyFunction(callback => callback()));
beforeEach(async () => { await act(async () => { await clearQueryData(); }); mockStore = 's'; mockSales.mockReset().mockResolvedValue([sale]); mockRequests.mockReset().mockResolvedValue([request]); mockDelete.mockReset().mockResolvedValue(undefined); mockReview.mockReset().mockResolvedValue(undefined); });
afterEach(async () => { await act(async () => { await clearQueryData(); }); });
it('수기 매출 조회 실패는 합계 0원이나 빈 목록 성공과 구분하고 재시도로 복구한다', async () => {
 mockSales.mockRejectedValueOnce(new Error('offline')); const {result} = renderHook(()=>useManualSales('2026-10'));
 await act(async()=>{await result.current.refetch();}); await waitFor(()=>expect(result.current.error).toBeTruthy());
 expect(result.current.total).toBeNull(); expect(result.current.ready).toBe(false);
 await act(async()=>{await result.current.refetch();}); await waitFor(()=>expect(result.current.total).toBe(300)); expect(result.current.error).toBeNull();
});
it('요청함 조회 실패는 대기 요청 0건으로 단정하지 않는다', async () => {
 mockRequests.mockRejectedValueOnce(new Error('offline')); const {result}=renderHook(()=>useRequestApprovals());
 await act(async()=>{await result.current.refetch();}); await waitFor(()=>expect(result.current.error).toBeTruthy()); expect(result.current.totalPending).toBeNull();
 await act(async()=>{await result.current.refetch();}); await waitFor(()=>expect(result.current.totalPending).toBe(1));
});
it('갱신 실패에도 이전 수기 매출을 유지하되 합계를 확정하지 않고 삭제를 막는다', async () => {
 const {result}=renderHook(()=>useManualSales('2026-10')); await act(async()=>{await result.current.refetch();}); await waitFor(()=>expect(result.current.ready).toBe(true));
 mockSales.mockRejectedValueOnce(new Error('offline')); await act(async()=>{await result.current.refetch();}); await waitFor(()=>expect(result.current.error).toBeTruthy());
 expect(result.current.sales).toEqual([sale]); expect(result.current.total).toBeNull(); await act(async()=>{await result.current.remove(sale.id);}); expect(mockDelete).not.toHaveBeenCalled();
});
it('삭제 실패는 내역을 지우지 않고 재조회 전 반복 삭제를 막는다', async () => {
 const {result}=renderHook(()=>useManualSales('2026-10')); await act(async()=>{await result.current.refetch();}); await waitFor(()=>expect(result.current.ready).toBe(true));
 mockDelete.mockRejectedValueOnce(new Error('lost')); await act(async()=>{await result.current.remove(sale.id);});
 expect(result.current.sales).toEqual([sale]); expect(result.current.actionError).toBeTruthy(); expect(result.current.total).toBeNull(); await act(async()=>{await result.current.remove(sale.id);}); expect(mockDelete).toHaveBeenCalledTimes(1);
 mockSales.mockResolvedValueOnce([]); await act(async()=>{await result.current.refetch();}); await waitFor(()=>expect(result.current.sales).toEqual([])); expect(result.current.actionError).toBeNull();
});
it('승인 실패는 요청을 유지하고 재조회 전에 재승인하지 않는다', async () => {
 const {result}=renderHook(()=>useRequestApprovals()); await act(async()=>{await result.current.refetch();}); await waitFor(()=>expect(result.current.ready).toBe(true));
 mockReview.mockRejectedValueOnce(new Error('partial')); await act(async()=>{await result.current.reviewSchedule(request,true);});
 expect(result.current.scheduleRequests).toEqual([request]); expect(result.current.actionError).toContain('일부 반영'); await act(async()=>{await result.current.reviewSchedule(request,true);}); expect(mockReview).toHaveBeenCalledTimes(1);
});
it('매장 변경 후 이전 조회가 새 요청함을 덮지 않는다', async () => {
 const old=deferred(); mockRequests.mockReturnValueOnce(old.promise); const {result,rerender}=renderHook(()=>useRequestApprovals());
 let pending!:Promise<void>; act(()=>{pending=result.current.refetch();}); mockStore='other'; rerender({}); mockRequests.mockResolvedValueOnce([]);
 await act(async()=>{await result.current.refetch();}); await act(async()=>{old.resolve([request]); await pending;}); await waitFor(()=>expect(result.current.scheduleRequests).toEqual([]));
});
it('월 변경 후 이전 수기 매출 응답이 현재 월에 섞이지 않는다', async () => {
 const old=deferred(); mockSales.mockReturnValueOnce(old.promise); const {result,rerender}=renderHook((p:{month:string})=>useManualSales(p.month),{initialProps:{month:'2026-10'}});
 let pending!:Promise<void>; act(()=>{pending=result.current.refetch();}); rerender({month:'2026-09'}); mockSales.mockResolvedValueOnce([]);
 await act(async()=>{await result.current.refetch();}); await act(async()=>{old.resolve([sale]);await pending;}); await waitFor(()=>expect(result.current.sales).toEqual([]));
});
it('승인 연타는 한 번만 쓰고 성공한 요청만 제거한다', async () => {
 const pending=deferred(); mockReview.mockReturnValueOnce(pending.promise); const {result}=renderHook(()=>useRequestApprovals());
 await act(async()=>{await result.current.refetch();}); await waitFor(()=>expect(result.current.ready).toBe(true)); let saving!:Promise<void>;
 act(()=>{saving=result.current.reviewSchedule(request,true); void result.current.reviewSchedule(request,true);}); expect(mockReview).toHaveBeenCalledTimes(1);
 await act(async()=>{pending.resolve(undefined);await saving;}); await waitFor(()=>expect(result.current.scheduleRequests).toEqual([]));
});
