import { act, renderHook } from '@testing-library/react-native';
import { useExpenses } from '../../lib/hooks/useExpenses';
import * as service from '../../lib/services/expenses';
import { notifyManager } from '@tanstack/react-query';
import { queryClient as mockSharedQueryClient } from '../../lib/query/client';
// 훅이 공용 쿼리 캐시를 쓰므로 테스트마다 비우고, 화면 알림을 동기로 받아 act 안에서 반영되게 한다.
notifyManager.setScheduler(callback => callback());
beforeEach(() => { mockSharedQueryClient.clear(); });
let mockAuth: any = { store: { id: 's' }, user: { id: 'u' }, currentRole: 'admin', canManageStore: true, devPreviewMode: 'self' };
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../lib/services/expenses', () => ({ getExpensesByMonth: jest.fn(), getEffectiveFixedExpenses: jest.fn(), createExpense: jest.fn(), updateExpense: jest.fn(), deleteExpense: jest.fn(), copyFixedExpensesWithDates: jest.fn() }));
const monthRead = service.getExpensesByMonth as jest.Mock;
const fixedRead = service.getEffectiveFixedExpenses as jest.Mock;
const create = service.createExpense as jest.Mock;
const update = service.updateExpense as jest.Mock;
const copy = service.copyFixedExpensesWithDates as jest.Mock;
const row = { id:'e',store_id:'s',year_month:'2026-11',category:'공과금',name:'전기',amount:20,occurred_on:'2026-11-02' };
function deferred<T>() { let resolve!: (value:T)=>void; const promise=new Promise<T>(r=>{resolve=r;}); return {promise,resolve}; }
beforeEach(()=>{ jest.clearAllMocks(); mockAuth={store:{id:'s'},user:{id:'u'},currentRole: 'admin', canManageStore: true,devPreviewMode:'self'}; monthRead.mockResolvedValue([]); fixedRead.mockResolvedValue([]); });
test('reverse responses cannot overwrite the latest query',async()=>{
 // 2026-11-24 쿼리 캐시 전환: 같은 키 재조회가 겹치면 나중 요청이 앞 요청을 취소한다(첫 조회는 중복 없이 하나로 합친다).
 const {result}=renderHook(()=>useExpenses('2026-11', false)); await act(async()=>{await result.current.refetch();});
 const first=deferred<any[]>(),second=deferred<any[]>(); monthRead.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
 let a!:Promise<void>, b!:Promise<void>; act(()=>{a=result.current.refetch();}); act(()=>{b=result.current.refetch();});
 await act(async()=>{second.resolve([row]);await b;}); await act(async()=>{first.resolve([]);await a;});
 expect(result.current.expenses).toEqual([row]); expect(result.current.loading).toBe(false);
});
test('account change hides old data and ignores old mutation completion',async()=>{
 const pending=deferred<any>(); create.mockReturnValue(pending.promise); const {result,rerender}=renderHook(()=>useExpenses('2026-11', false));
 monthRead.mockResolvedValue([row]); await act(async()=>{await result.current.refetch();});
 let mutation!:Promise<any>; act(()=>{mutation=result.current.add({category:'공과금',name:'전기',amount:20,occurred_on:'2026-11-02'});});
 mockAuth={...mockAuth,user:{id:'other'}}; rerender({}); expect(result.current.expenses).toEqual([]);
 await act(async()=>{pending.resolve(row);await mutation;}); expect(result.current.expenses).toEqual([]);
});
test('save/refetch race deduplicates IDs and finishes loading',async()=>{
 const pending=deferred<any>(); create.mockReturnValue(pending.promise); const {result}=renderHook(()=>useExpenses('2026-11', false));
 let mutation!:Promise<any>; act(()=>{mutation=result.current.add({category:'공과금',name:'전기',amount:20,occurred_on:'2026-11-02'});});
 monthRead.mockResolvedValue([row]); await act(async()=>{await result.current.refetch();});
 await act(async()=>{pending.resolve(row);await mutation;});
 expect(result.current.expenses).toEqual([row]); expect(result.current.loading).toBe(false);
});
// 2026-11-24: 저장 뒤 목록 재조회는 서비스의 매장 무효화가 맡는다(훅이 따로 다시 받지 않는다). 그래서 재조회 실패 표시는 여기서 확인하지 않는다.
test('date movement removes original-month row after saved update',async()=>{
 const {result}=renderHook(()=>useExpenses('2026-11', false)); monthRead.mockResolvedValue([row]);
 await act(async()=>{await result.current.refetch();}); update.mockResolvedValue({...row,year_month:'2026-12',occurred_on:'2026-12-01'}); monthRead.mockRejectedValue(new Error('조회 실패'));
 await act(async()=>{await expect(result.current.update('e',{name:'전기',amount:20,occurred_on:'2026-12-01'})).resolves.toBeTruthy();});
 expect(result.current.expenses).toEqual([]);
});
test('blocks double submission until first mutation completes',async()=>{
 const pending=deferred<any>();create.mockReturnValue(pending.promise);const {result}=renderHook(()=>useExpenses('2026-11', false));
 const input={category:'공과금' as const,name:'전기',amount:20,occurred_on:'2026-11-02'};
 let mutation!:Promise<any>;act(()=>{mutation=result.current.add(input);});
 await act(async()=>{await expect(result.current.add(input)).rejects.toThrow('저장 중');});
 expect(create).toHaveBeenCalledTimes(1);await act(async()=>{pending.resolve(row);await mutation;});
});
test('atomic copy failure preserves carried records; no local partial append',async()=>{
 const {result}=renderHook(()=>useExpenses('2026-11', false));const fixed={...row,category:'고정비',year_month:'2026-10'}; fixedRead.mockResolvedValue([fixed]);
 await act(async()=>{await result.current.refetch();});copy.mockRejectedValue(new Error('FIXED_COPY_INVALID'));
 await act(async()=>{await expect(result.current.copyCarriedFixedExpenses([{id:'e',occurred_on:'2026-11-02'}])).rejects.toThrow('FIXED_COPY_INVALID');});
 expect(result.current.carriedFixedExpenses).toEqual([fixed]);expect(result.current.expenses).toEqual([]);
});
