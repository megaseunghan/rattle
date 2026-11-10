import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useRecurringFixedExpenses } from '../../lib/hooks/useRecurringFixedExpenses';
import * as service from '../../lib/services/recurringFixedExpenses';
let mockAuth:any;
jest.mock('../../lib/contexts/AuthContext',()=>({useAuth:()=>mockAuth}));
jest.mock('../../lib/services/recurringFixedExpenses',()=>({getRecurringFixedExpenses:jest.fn(),saveRecurringFixedExpense:jest.fn()}));
const read=service.getRecurringFixedExpenses as jest.Mock, save=service.saveRecurringFixedExpense as jest.Mock;
const empty={rules:[],occurrences:[],adoptedSourceIds:[]};
const input:any={rule_id:'r',store_id:'s',effective_month:'2026-12',name:'비용',amount:10,payment_day:31,active:true,end_month:null,source_expense_id:null,expected_revision:null};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
beforeEach(()=>{jest.clearAllMocks();mockAuth={user:{id:'u'},store:{id:'s'},currentRole:'admin',devPreviewMode:'self'};read.mockResolvedValue(empty);});
test('scope switch hides old records and rejects old responses',async()=>{
 const old=deferred<any>();read.mockReturnValueOnce(old.promise);const {result,rerender}=renderHook(()=>useRecurringFixedExpenses('2026-11'));
 mockAuth={...mockAuth,user:{id:'other'}};rerender({});await waitFor(()=>expect(result.current.loading).toBe(false));
 await act(async()=>{old.resolve({...empty,adoptedSourceIds:['old']});});expect(result.current.data).toEqual(empty);
});
test('latest response wins after reverse completion',async()=>{
 const old=deferred<any>();read.mockReturnValueOnce(old.promise);const {result}=renderHook(()=>useRecurringFixedExpenses('2026-11'));
 await act(async()=>{await result.current.refetch();});await act(async()=>{old.resolve({...empty,adoptedSourceIds:['old']});});expect(result.current.data).toEqual(empty);
});
test('save success stays success when refresh fails',async()=>{
 const {result}=renderHook(()=>useRecurringFixedExpenses('2026-11'));await waitFor(()=>expect(result.current.loading).toBe(false));
 save.mockResolvedValue('r');read.mockRejectedValue(new Error('refresh failed'));
 await act(async()=>{await expect(result.current.save(input)).resolves.toBe('r');});expect(result.current.error).toBeTruthy();
});
test('pending save rejects double submit and wrong store/admin',async()=>{
 const pending=deferred<string>();save.mockReturnValue(pending.promise);const {result,rerender}=renderHook(()=>useRecurringFixedExpenses('2026-11'));await waitFor(()=>expect(result.current.loading).toBe(false));
 let first!:Promise<string>;act(()=>{first=result.current.save(input);});await act(async()=>{await expect(result.current.save(input)).rejects.toThrow('저장 중');});expect(save).toHaveBeenCalledTimes(1);
 await act(async()=>{pending.resolve('r');await first;});
 mockAuth={...mockAuth,currentRole:'member'};rerender({});await act(async()=>{await expect(result.current.save(input)).rejects.toThrow('관리자');});
});
