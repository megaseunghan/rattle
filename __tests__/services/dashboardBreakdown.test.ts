import { buildDashboardBreakdown } from '../../lib/services/dashboardBreakdown';
import type { ProfitLoss } from '../../types';
const detail = (overrides: Partial<ProfitLoss> = {}) => ({ revenue: 1000, cardRevenue: 600, cashRevenue: 300, purchaseCost: 400, purchaseByCategory: { 식자재: 250, 비품: 100 }, purchaseBySupplier: { 거래처A: 400 }, regularGross: 200, partTimeGross: 50, laborCost: 250, fixedExpense: 100, variableExpense: 80, marketingExpense: 20, maintenanceExpense: 10, utilitiesExpense: 30, cardFeeExpense: 20, ...overrides } as ProfitLoss);
it('결제수단 없는 과거 매출을 카드로 임의 배정하지 않는다', () => {
  const result = buildDashboardBreakdown([detail()], 'revenue');
  expect(result.total).toBe(1000);
  expect(result.rows).toContainEqual({ label: '결제수단 미분류', amount: 100 });
  expect(result.rows.reduce((n, row) => n + row.amount!, 0)).toBe(result.total);
});
it('여러 매장·월의 분류와 거래처를 합치고 두 합계 모두 매입 총액과 맞춘다', () => {
  const result = buildDashboardBreakdown([detail(), detail()], 'purchase');
  expect(result.total).toBe(800);
  expect(result.rows).toContainEqual({ label: '분류 확인 필요', amount: 100 });
  expect(result.suppliers).toEqual([{ label: '거래처A', amount: 800 }]);
  expect(result.rows.reduce((n, row) => n + row.amount!, 0)).toBe(result.total);
});
it('거래처 미분류와 마이너스 차액을 숨기지 않는다', () => {
  const result = buildDashboardBreakdown([detail({ purchaseCost: 300, purchaseBySupplier: undefined })], 'purchase');
  expect(result.rows).toContainEqual({ label: '분류 확인 필요', amount: -50 });
  expect(result.suppliers).toEqual([{ label: '거래처 미분류', amount: 300 }]);
});
it('비용은 이월 고정비와 수수료를 포함한 손익 기준 합계다', () => {
  const result = buildDashboardBreakdown([detail()], 'expense');
  expect(result.total).toBe(180);
  expect(result.rows.reduce((n, row) => n + row.amount!, 0)).toBe(180);
  expect(result.rows).toContainEqual({ label: '카드 수수료(예상)', amount: 20 });
});
it('정규직 급여 누락이 있으면 전체 인건비와 정규직 합계를 확인 필요로 남긴다', () => {
  const result = buildDashboardBreakdown([detail(), detail({ regularGross: null, laborCost: null })], 'labor');
  expect(result.total).toBeNull();
  expect(result.rows).toContainEqual({ label: '직원 · 월급제', amount: null });
  expect(result.rows).toContainEqual({ label: '파트타이머 · 시급제', amount: 100 });
});
