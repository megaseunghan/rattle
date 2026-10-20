import { supabase } from '../../lib/supabase';
import { getProfitLossByMonth, getYearlyProfitLoss } from '../../lib/services/profitLoss';
const mockManualTotals = jest.fn();

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('../../lib/services/purchases', () => ({ getPurchasesByMonth: async () => [], getPurchaseItemsForPurchases: async () => [] }));
jest.mock('../../lib/services/expenses', () => ({ getExpensesByMonth: async () => [], getEffectiveFixedExpenses: async () => [] }));
jest.mock('../../lib/services/manualSales', () => ({ getManualSalesTotals: (...args: unknown[]) => mockManualTotals(...args) }));
jest.mock('../../lib/services/wageHistory', () => ({ getStoreWageHistory: async () => [], regularGrossForMonth: () => 0 }));
jest.mock('../../lib/services/payroll', () => ({ probationFactor: () => 1 }));
beforeEach(() => { mockManualTotals.mockReset().mockResolvedValue({ total: 1000000, cardRevenue: 0, cashRevenue: 1000000 }); });

function setup(payrolls: unknown[], payrollError: unknown = null) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const result = table === 'payroll' ? { data: payrolls, error: payrollError }
      : { data: [], error: null };
    return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve) };
  });
}

it('퇴사·삭제 후에도 저장한 분 기준 급여가 손익에 한 번 반영된다', async () => {
  setup([{ employee_id: 'inactive', gross: 120000, net_pay: 116040, applied_hourly_wage: 12000, work_source: 'manual' },
    { employee_id: null, gross: 80000, net_pay: 80000, work_source: 'legacy_attendance' }]);
  const result = await getProfitLossByMonth('store', '2026-09', '23:00');
  expect(result.partTimeGross).toBe(200000);
  expect(result.partTimeWithholding).toBe(3960);
  expect(result.laborCost).toBe(200000);
  expect(result.netProfit).toBe(800000);
  expect((supabase.from as jest.Mock).mock.calls.some(([name]) => name === 'attendance')).toBe(false);
});

it('급여 조회 실패를 인건비 0원으로 처리하지 않는다', async () => {
  setup([], { message: '급여 조회 실패' });
  await expect(getProfitLossByMonth('store', '2026-09', '23:00')).rejects.toThrow('급여 조회 실패');
});

it('연간 손익은 월 순서를 유지하면서 동시에 두 달까지만 조회한다', async () => {
  setup([]);
  let active = 0, maximum = 0;
  mockManualTotals.mockImplementation(async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await Promise.resolve();
    active -= 1;
    return { total: 0, cardRevenue: 0, cashRevenue: 0 };
  });
  const result = await getYearlyProfitLoss('store', 2025, '23:00');
  expect(result.map(row => row.month)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  expect(maximum).toBe(2);
  expect(mockManualTotals).toHaveBeenCalledTimes(12);
});
