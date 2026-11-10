import { validateExpenseDate, validateExpenseAmount } from '../../lib/utils/expenseDate';
import { getDailyExpenseSeries } from '../../lib/services/dailyExpenseSeries';
import { createExpense, updateExpense } from '../../lib/services/expenses';
import { supabase } from '../../lib/supabase';
import { invalidateCachedStore } from '../../lib/services/cacheInvalidation';
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn() }));
const rpc = supabase.rpc as jest.Mock;
const from = supabase.from as jest.Mock;
beforeEach(()=>jest.clearAllMocks());
test.each(['2026-02-29','2026-11-31','2026-1-01','0000-01-01','2026-11-05T00:00:00Z'])('rejects invalid occurrence %s',value=>expect(()=>validateExpenseDate(value)).toThrow());
test('leap day and KST labels have no device timezone conversion',()=>expect(validateExpenseDate('2024-02-29')).toBe('2024-02-29'));
test.each([Infinity,NaN,-1,0])('rejects invalid amount %s',amount=>expect(()=>validateExpenseAmount('비용',amount)).toThrow());
test('RPC failure never becomes zero or an empty chart',async()=>{
 rpc.mockResolvedValue({error:{message:'FINANCE_ADMIN_REQUIRED'}});
 await expect(getDailyExpenseSeries('s','2026-11')).rejects.toEqual({message:'FINANCE_ADMIN_REQUIRED'});
});
test('retains partial coverage/null',async()=>{
 const value={availability:'partial',unallocatedAmount:100,days:[{date:'2026-11-01',amount:null,knownAmount:30}]};
 rpc.mockResolvedValue({data:value,error:null}); expect(await getDailyExpenseSeries('s','2026-11')).toBe(value);
});
test('creation rejects inconsistent month before writing',async()=>{
 await expect(createExpense({store_id:'s',year_month:'2026-10',occurred_on:'2026-11-01',category:'공과금',name:'비용',amount:10})).rejects.toThrow('등록 월');
 expect(from).not.toHaveBeenCalled();
});
test('moving a date updates month together and invalidates all stores/months',async()=>{
 const single=jest.fn().mockResolvedValue({data:{id:'e',year_month:'2026-12'},error:null});
 const update=jest.fn().mockReturnValue({eq:()=>({select:()=>({single})})}); from.mockReturnValue({update});
 await updateExpense('e',{name:'전기',amount:20,occurred_on:'2026-12-01'});
 expect(update).toHaveBeenCalledWith({name:'전기',amount:20,occurred_on:'2026-12-01',year_month:'2026-12'});
 expect(invalidateCachedStore).toHaveBeenCalledWith();
});
