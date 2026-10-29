import { getMultiStoreMonthlyPnl, getMultiStoreMonthlyTrend, getMultiStoreYearlyPnl } from '../../lib/services/adminDashboard';
import type { Store } from '../../types';
const mockRows=jest.fn();
jest.mock('../../lib/services/homeFinancialSummary',()=>({getFinancialSummaries:(...a:unknown[])=>mockRows(...a)}));
jest.mock('../../lib/query/financial',()=>({fetchFinancialSummary:jest.fn()}));
jest.mock('../../lib/services/cleaning',()=>({}));
jest.mock('../../lib/services/schedule',()=>({}));
const stores=[{id:'a',name:'정상'},{id:'b',name:'확인'}] as Store[];
beforeEach(()=>mockRows.mockImplementation(async(ids:string[],months:string[])=>ids.flatMap(storeId=>months.map(yearMonth=>({storeId,yearMonth,revenue:100,purchaseCost:10,fixedExpense:1,variableExpense:2,laborCost:storeId==='b'&&yearMonth==='2026-09'?null:20,operatingProfit:storeId==='b'&&yearMonth==='2026-09'?null:67})))));
it('과거 누락이 현재 월과 정상 매장의 조회를 막지 않는다',async()=>{
 const rows=await getMultiStoreMonthlyPnl(stores,'2026-10');
 expect(rows.current.map(r=>r.profit)).toEqual([67,67]); expect(rows.previous.map(r=>r.profit)).toEqual([67,null]);
 expect(rows.previous[1].revenue).toBe(100); expect(rows.previous[1].expense).toBeNull();
});
it('추세에서 누락 월을 0원으로 그리지 않는다',async()=>{
 expect((await getMultiStoreMonthlyTrend(stores,'2026-10',2)).map(r=>r.value)).toEqual([null,134]);
});
it('미확인 월이 포함된 연간 이익·인건비만 미확인으로 남긴다',async()=>{
 const rows=await getMultiStoreYearlyPnl(stores,2026);
 expect(rows.current[0].profit).not.toBeNull(); expect(rows.current[1]).toMatchObject({profit:null,laborCost:null,expense:null,margin:null});
 expect(rows.current[1].revenue).toBeGreaterThan(0);
});
