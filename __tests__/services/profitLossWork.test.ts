import { supabase } from '../../lib/supabase';
import { getProfitLossByMonth, getYearlyProfitLoss } from '../../lib/services/profitLoss';
const mockManualTotals = jest.fn();
const mockPurchases = jest.fn();
const mockWageHistory = jest.fn();

jest.mock('../../lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn().mockResolvedValue({ error: null }) } }));
jest.mock('../../lib/services/purchases', () => ({ getPurchasesByMonth: (...args: unknown[]) => mockPurchases(...args), getPurchaseItemsForPurchases: async () => [] }));
jest.mock('../../lib/services/expenses', () => ({ getExpensesByMonth: async () => [], getEffectiveFixedExpenses: async () => [] }));
jest.mock('../../lib/services/manualSales', () => ({ getManualSalesTotals: (...args: unknown[]) => mockManualTotals(...args) }));
jest.mock('../../lib/services/wageHistory', () => ({ getStoreWageHistory: (...args: unknown[]) => mockWageHistory(...args), regularGrossForMonth: () => 999 }));
jest.mock('../../lib/services/payroll', () => ({ probationFactor: () => 1 }));
beforeEach(() => { mockPurchases.mockReset().mockResolvedValue([]); mockWageHistory.mockReset().mockResolvedValue([]); mockManualTotals.mockReset().mockResolvedValue({ total: 1000000, cardRevenue: 0, cashRevenue: 1000000 }); });

function setup(payrolls: unknown[], payrollError: unknown = null, employees: unknown[] = [], pageLimit = 500) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const result = table === 'payroll' ? { data: payrolls, error: payrollError }
      : table === 'employees' ? { data: employees, error: null } : { data: [], error: null };
    let offset = 0;
    return { order: jest.fn().mockReturnThis(), range: jest.fn().mockImplementation(function(this: unknown, start: number) { offset=start; return this; }), select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(), lte: jest.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => void) => Promise.resolve(result.error ? result : {data: result.data.slice(offset, offset + pageLimit), error:null}).then(resolve) };
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
  await expect(getProfitLossByMonth('store', '2026-09', '23:00')).rejects.toMatchObject({ message: '급여 조회 실패' });
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

it('손익 조회 권한이 없으면 일부 급여만 집계해 표시하지 않는다', async () => {
  (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: { message: 'FINANCE_ADMIN_REQUIRED' } });
  await expect(getProfitLossByMonth('store', '2026-10', '23:00')).rejects.toEqual({ message: 'FINANCE_ADMIN_REQUIRED' });
});


it('재직 정규직의 적용 시작 급여 이력이 없으면 인건비를 0원으로 표시하지 않는다', async () => {
  setup([], null, [{ id: 'regular', employment_type: 'regular', is_active: true, joined_at: '2026-09-01' }]);
  await expect(getProfitLossByMonth('store', '2026-09', '23:00')).resolves.toMatchObject({ regularGross: null, laborCost: null, netProfit: null, revenue: 1000000, missingWageEmployeeIds: ['regular'] });
});

it('월 중간 이력만 있으면 앞부분의 누락을 숨기지 않는다', async () => {
  setup([], null, [{ id: 'regular', employment_type: 'regular', is_active: true, joined_at: '2026-09-01' }]);
  mockWageHistory.mockResolvedValue([{ employee_id: 'regular', effective_date: '2026-09-15', base_salary: 3000000 }]);
  await expect(getProfitLossByMonth('store', '2026-09', '23:00')).resolves.toMatchObject({ regularGross: null, laborCost: null, netProfit: null, revenue: 1000000, missingWageEmployeeIds: ['regular'] });
});

it('실제 입사일이 조회 월 이후면 급여 이력이 없어도 해당 월 인건비에 포함하지 않는다', async () => {
  setup([], null, [{ id: 'regular', employment_type: 'regular', is_active: true, joined_at: '2026-10-01' }]);
  await expect(getProfitLossByMonth('store', '2026-09', '23:00')).resolves.toMatchObject({ regularGross: 0, laborCost: 0 });
});

it('급여 이력이 없어도 저장된 정규직 월 급여를 그대로 사용한다', async () => {
  setup([{ employee_id: 'regular', gross: 2400000, net_pay: 2200000 }], null,
    [{ id: 'regular', employment_type: 'regular', is_active: true, joined_at: '2026-09-01' }]);
  await expect(getProfitLossByMonth('store', '2026-09', '23:00')).resolves.toMatchObject({ regularGross: 2400000, laborCost: 2400000, netProfit: -1400000 });
});

it('퇴사 정규직과 직원 연결이 없는 저장 급여도 보존한다', async () => {
  setup([{ employee_id: 'resigned', gross: 123456, net_pay: 120000 }, { employee_id: null, gross: 10000 }], null,
    [{ id: 'resigned', employment_type: 'regular', is_active: false }]);
  await expect(getProfitLossByMonth('store', '2026-09', '23:00')).resolves.toMatchObject({ regularGross: 133456, laborCost: 133456 });
});

it('저장된 0원은 미입력과 구분하고 현재 급여로 재계산하지 않는다', async () => {
  setup([{ employee_id: 'regular', gross: 0, net_pay: 0 }], null,
    [{ id: 'regular', employment_type: 'regular', is_active: true, joined_at: '2026-09-01' }]);
  await expect(getProfitLossByMonth('store', '2026-09', '23:00')).resolves.toMatchObject({ regularGross: 0, laborCost: 0, netProfit: 1000000 });
});

it('서버 페이지 상한을 넘는 저장 급여 전체를 한 번씩 합산한다', async () => {
  setup(Array.from({length:1203},(_,i)=>({employee_id:`old-${i}`,gross:100,net_pay:100})),null,[],127);
  await expect(getProfitLossByMonth('store','2026-09','23:00')).resolves.toMatchObject({regularGross:120300,laborCost:120300,netProfit:879700});
});
it('저장 명세가 있으면 충분한 이력도 추가 합산하거나 현재 조건으로 대체하지 않는다', async () => {
  setup([{employee_id:'regular',gross:123456,net_pay:120000}],null,[{id:'regular',employment_type:'regular',is_active:true,joined_at:'2026-09-01'}]);
  mockWageHistory.mockResolvedValue([{employee_id:'regular',effective_date:'2026-09-01',base_salary:9000000}]);
  await expect(getProfitLossByMonth('store','2026-09','23:00')).resolves.toMatchObject({regularGross:123456,laborCost:123456});
});
it('최초 급여 이력이 늦게 등록돼도 입사일부터 최초 조건을 적용한다', async () => {
  setup([], null, [{ id: 'regular', store_id: 'store', employment_type: 'regular', is_active: true,
    joined_at: '2026-09-01', created_at: '2026-09-15T00:00:00Z', base_salary: 4000000, non_taxable: 200000 }]);
  mockWageHistory.mockResolvedValue([{ id:'w', employee_id:'regular', store_id:'store', effective_date:'2026-09-15',
    base_salary:3000000, non_taxable:200000, created_at:'2026-09-15T00:00:00Z' }]);
  await expect(getProfitLossByMonth('store','2026-09','23:00')).resolves.toMatchObject({regularGross:3000000,laborCost:3000000,missingWageEmployeeIds:[]});
});
it('직원 연결이 해제된 일별 급여 스냅샷도 파트 급여에 한 번만 합산한다', async () => {
  setup([{employee_id:null,gross:20334,net_pay:19664,applied_hourly_wage:null,daily_work_snapshot:[],work_source:'manual'}]);
  await expect(getProfitLossByMonth('store','2026-09','23:00')).resolves.toMatchObject({regularGross:0,partTimeGross:20334,laborCost:20334});
});

it('현재 월은 저장 월급 전체가 아니라 한국 날짜까지 누적하고 파트 급여는 저장액으로 합산한다', async () => {
  setup([
    { employee_id: 'regular', gross: 3100000, net_pay: 2800000 },
    { employee_id: 'part', gross: 120000, net_pay: 116040, applied_hourly_wage: 12000 },
  ], null, [{ id: 'regular', employment_type: 'regular', is_active: true, joined_at: '2026-01-01' }]);
  const result = await getProfitLossByMonth('store', '2026-10', '23:00', new Date('2026-10-09T15:00:00Z'));
  expect(result).toMatchObject({ regularGross: 1000000, partTimeGross: 120000, laborCost: 1120000, operatingProfit: -120000 });
});

it('직원 연결이 해제된 현재 월 정규직 명세도 요약과 같은 날짜까지 일할 누적한다', async () => {
  const payroll = { employee_id: null, gross: 3100000, net_pay: 2800000 };
  setup([payroll]);
  await expect(getProfitLossByMonth('store', '2026-10', '23:00', new Date('2026-10-10T03:00:00Z')))
    .resolves.toMatchObject({ regularGross: 1000000, laborCost: 1000000 });
  expect(payroll.gross).toBe(3100000);
});

it('미래 월의 저장 급여는 정규직·파트 모두 아직 발생한 인건비에 합산하지 않는다', async () => {
  setup([{ employee_id: null, gross: 3100000 }, { employee_id: 'part', gross: 120000, applied_hourly_wage: 12000 }]);
  await expect(getProfitLossByMonth('store', '2026-11', '23:00', new Date('2026-10-27T03:00:00Z')))
    .resolves.toMatchObject({ regularGross: 0, partTimeGross: 0, laborCost: 0 });
});

it('현재 월 스냅샷은 변경일별 금액으로 누적하고 지난 월은 저장 총액을 보존한다', async () => {
  const snapshot = { version: 1, year_month: '2026-10', days: Array.from({ length: 31 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`, base_salary: i < 15 ? 3100000 : 6200000, non_taxable: 0, factor: 1,
  })) };
  setup([{ employee_id: 'regular', gross: 4700000, regular_wage_snapshot: snapshot }], null,
    [{ id: 'regular', employment_type: 'regular', is_active: true, joined_at: '2026-01-01' }]);
  await expect(getProfitLossByMonth('store', '2026-10', '23:00', new Date('2026-10-20T03:00:00Z')))
    .resolves.toMatchObject({ regularGross: 2500000, laborCost: 2500000 });
  await expect(getProfitLossByMonth('store', '2026-10', '23:00', new Date('2026-11-01T03:00:00Z')))
    .resolves.toMatchObject({ regularGross: 4700000, laborCost: 4700000 });
});

it('거래처명이 객체 예약어여도 누락하거나 금액을 문자열로 만들지 않는다', async () => {
  setup([]);
  mockPurchases.mockResolvedValue([{ id: 'p1', category: '식자재', supplier: '__proto__', amount: 100 }, { id: 'p2', category: '비품', supplier: 'constructor', amount: 35 }]);
  const result = await getProfitLossByMonth('store', '2026-09', '23:00');
  expect(result.purchaseBySupplier?.['__proto__']).toBe(100);
  expect(result.purchaseBySupplier?.constructor).toBe(35);
  expect(Object.values(result.purchaseBySupplier!).reduce((sum, amount) => sum + amount, 0)).toBe(result.purchaseCost);
});
