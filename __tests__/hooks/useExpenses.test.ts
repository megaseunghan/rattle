import { act, renderHook } from '@testing-library/react-native';
import { useExpenses } from '../../lib/hooks/useExpenses';
import * as service from '../../lib/services/expenses';
let mockAuth: any = { store: { id: 's' }, user: { id: 'u' }, currentRole: 'admin', devPreviewMode: 'self' };
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../lib/services/expenses', () => ({ getExpensesByMonth: jest.fn(), getEffectiveFixedExpenses: jest.fn(), createExpense: jest.fn(), updateExpense: jest.fn(), deleteExpense: jest.fn(), copyFixedExpensesWithDates: jest.fn() }));
const monthRead = service.getExpensesByMonth as jest.Mock;
const fixedRead = service.getEffectiveFixedExpenses as jest.Mock;
const create = service.createExpense as jest.Mock;
const update = service.updateExpense as jest.Mock;
const copy = service.copyFixedExpensesWithDates as jest.Mock;
const row = { id:'e',store_id:'s',year_month:'2026-11',category:'공과금',name:'전기',amount:20,occurred_on:'2026-11-02' };
function deferred<T>() { let resolve!: (value:T)=>void; const promise=new Promise<T>(r=>{resolve=r;}); return {promise,resolve}; }
beforeEach(()=>{ jest.clearAllMocks(); mockAuth={store:{id:'s'},user:{id:'u'},currentRole:'admin',devPreviewMode:'self'}; monthRead.mockResolvedValue([]); fixedRead.mockResolvedValue([]); });
test('reverse responses cannot overwrite the latest query',async()=>{
 const first=deferred<any[]>(),second=deferred<any[]>(); monthRead.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
 const {result}=renderHook(()=>useExpenses('2026-11'));
 let a!:Promise<void>, b!:Promise<void>; act(()=>{a=result.current.refetch();b=result.current.refetch();});
 await act(async()=>{second.resolve([row]);await b;}); await act(async()=>{first.resolve([]);await a;});
 expect(result.current.expenses).toEqual([row]); expect(result.current.loading).toBe(false);
});
test('account change hides old data and ignores old mutation completion',async()=>{
 const pending=deferred<any>(); create.mockReturnValue(pending.promise); const {result,rerender}=renderHook(()=>useExpenses('2026-11'));
 monthRead.mockResolvedValue([row]); await act(async()=>{await result.current.refetch();});
 let mutation!:Promise<any>; act(()=>{mutation=result.current.add({category:'공과금',name:'전기',amount:20,occurred_on:'2026-11-02'});});
 mockAuth={...mockAuth,user:{id:'other'}}; rerender({}); expect(result.current.expenses).toEqual([]);
 await act(async()=>{pending.resolve(row);await mutation;}); expect(result.current.expenses).toEqual([]);
});
test('save/refetch race deduplicates IDs and finishes loading',async()=>{
 const pending=deferred<any>(); create.mockReturnValue(pending.promise); const {result}=renderHook(()=>useExpenses('2026-11'));
 let mutation!:Promise<any>; act(()=>{mutation=result.current.add({category:'공과금',name:'전기',amount:20,occurred_on:'2026-11-02'});});
 monthRead.mockResolvedValue([row]); await act(async()=>{await result.current.refetch();});
 await act(async()=>{pending.resolve(row);await mutation;});
 expect(result.current.expenses).toEqual([row]); expect(result.current.loading).toBe(false);
});
test('date movement removes original-month row; refresh failure reports error after saved update',async()=>{
 const {result}=renderHook(()=>useExpenses('2026-11')); monthRead.mockResolvedValue([row]);
 await act(async()=>{await result.current.refetch();}); update.mockResolvedValue({...row,year_month:'2026-12',occurred_on:'2026-12-01'}); monthRead.mockRejectedValue(new Error('조회 실패'));
 await act(async()=>{await expect(result.current.update('e',{name:'전기',amount:20,occurred_on:'2026-12-01'})).resolves.toBeTruthy();});
 expect(result.current.expenses).toEqual([]);expect(result.current.error).toBeTruthy();
});
test('blocks double submission until first mutation completes',async()=>{
 const pending=deferred<any>();create.mockReturnValue(pending.promise);const {result}=renderHook(()=>useExpenses('2026-11'));
 const input={category:'공과금' as const,name:'전기',amount:20,occurred_on:'2026-11-02'};
 let mutation!:Promise<any>;act(()=>{mutation=result.current.add(input);});
 await act(async()=>{await expect(result.current.add(input)).rejects.toThrow('저장 중');});
 expect(create).toHaveBeenCalledTimes(1);await act(async()=>{pending.resolve(row);await mutation;});
});
test('atomic copy failure preserves carried records; no local partial append',async()=>{
 const {result}=renderHook(()=>useExpenses('2026-11'));const fixed={...row,category:'고정비',year_month:'2026-10'}; fixedRead.mockResolvedValue([fixed]);
 await act(async()=>{await result.current.refetch();});copy.mockRejectedValue(new Error('FIXED_COPY_INVALID'));
 await act(async()=>{await expect(result.current.copyCarriedFixedExpenses([{id:'e',occurred_on:'2026-11-02'}])).rejects.toThrow('FIXED_COPY_INVALID');});
 expect(result.current.carriedFixedExpenses).toEqual([fixed]);expect(result.current.expenses).toEqual([]);
});
