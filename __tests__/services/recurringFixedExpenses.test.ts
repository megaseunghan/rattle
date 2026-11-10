import { recurringExpenseDate, koreaExpenseMonth, nextExpenseMonth } from '../../lib/utils/recurringExpense';
import { getRecurringFixedExpenses, saveRecurringFixedExpense } from '../../lib/services/recurringFixedExpenses';
import { getEffectiveFixedExpenses, updateExpense, deleteExpense } from '../../lib/services/expenses';
import { supabase } from '../../lib/supabase';
import { invalidateCachedStore } from '../../lib/services/cacheInvalidation';
import type { SaveRecurringFixedExpense } from '../../lib/types/recurringExpenses';
jest.mock('../../lib/supabase',()=>({supabase:{rpc:jest.fn(),from:jest.fn()}}));
jest.mock('../../lib/services/cacheInvalidation',()=>({invalidateCachedStore:jest.fn()}));
const rpc=supabase.rpc as jest.Mock;
const input:SaveRecurringFixedExpense={rule_id:'rule',store_id:'store',effective_month:'2026-12',name:'임대료',amount:100,payment_day:31,active:true,end_month:null,source_expense_id:null,expected_revision:null};
beforeEach(()=>jest.clearAllMocks());
test.each([['2026-04',31,'2026-04-30'],['2026-02',31,'2026-02-28'],['2024-02',31,'2024-02-29'],['2024-02',30,'2024-02-29'],['2026-02',29,'2026-02-28'],['2026-03',31,'2026-03-31'],['2026-01',1,'2026-01-01']])('month-end clamp %s day %s', (month,day,expected)=>expect(recurringExpenseDate(String(month),Number(day))).toBe(expected));
test.each([0,-1,32,NaN,1.5,Infinity])('reject day %s',day=>expect(()=>recurringExpenseDate('2026-11',day)).toThrow());
test('KST month boundary and year rollover',()=>{
 expect(koreaExpenseMonth(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01');
 expect(nextExpenseMonth('2026-12')).toBe('2027-01');
});
test('save sends stable ID, revision and all future-change fields and invalidates every month',async()=>{
 rpc.mockResolvedValue({data:'rule',error:null});await saveRecurringFixedExpense({...input,expected_revision:2,active:false,end_month:'2027-02'});
 expect(rpc).toHaveBeenCalledWith('save_recurring_fixed_expense',expect.objectContaining({p_rule_id:'rule',p_store_id:'store',p_expected_revision:2,p_effective_month:'2026-12',p_active:false,p_end_month:'2027-02'}));
 expect(invalidateCachedStore).toHaveBeenCalledWith('store');
});
test('invalid input never reaches server',async()=>{
 await expect(saveRecurringFixedExpense({...input,payment_day:32})).rejects.toThrow();
 await expect(saveRecurringFixedExpense({...input,end_month:'2026-11'})).rejects.toThrow();
 expect(rpc).not.toHaveBeenCalled();
});
test('revision conflict is actionable, preserves error and does not invalidate as success',async()=>{
 rpc.mockResolvedValue({error:{message:'RECURRING_EXPENSE_VERSION_CONFLICT'}});
 await expect(saveRecurringFixedExpense(input)).rejects.toThrow('다시 불러온');expect(invalidateCachedStore).not.toHaveBeenCalled();
});
test('read failure never becomes empty/zero',async()=>{
 rpc.mockResolvedValue({error:{message:'FINANCE_ADMIN_REQUIRED'}});await expect(getRecurringFixedExpenses('s','2026-11')).rejects.toEqual({message:'FINANCE_ADMIN_REQUIRED'});
});
test('existing fixed service uses canonical rows once including recurring, no legacy duplicate',async()=>{
 rpc.mockResolvedValue({data:[{id:'recurring:r:2026-11',category:'고정비',name:'임대료',amount:100,occurred_on:'2026-11-30',original_year_month:'2026-11',origin:'recurring'},
 {id:'manual',category:'공과금',amount:20}],error:null});
 const rows=await getEffectiveFixedExpenses('s','2026-11');expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id:'recurring:r:2026-11',year_month:'2026-11',amount:100});
 expect(supabase.from).not.toHaveBeenCalled();
});

test('linked source move/delete failures explain recovery',async()=>{
 const failure={error:{message:'RECURRING_EXPENSE_SOURCE_LOCKED'}};
 const chain:any={update:jest.fn().mockReturnThis(),delete:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),select:jest.fn().mockReturnThis(),single:jest.fn().mockResolvedValue(failure),then:(resolve:any)=>Promise.resolve(failure).then(resolve)};
 (supabase.from as jest.Mock).mockReturnValue(chain);
 await expect(updateExpense('legacy',{name:'임대료',amount:100,occurred_on:'2027-01-01'})).rejects.toThrow('반복 일정에서 변경');
 await expect(deleteExpense('legacy')).rejects.toThrow('반복 일정에서 변경');
 expect(invalidateCachedStore).not.toHaveBeenCalled();
});
