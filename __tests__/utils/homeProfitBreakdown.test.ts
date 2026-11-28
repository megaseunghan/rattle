import { buildBreakdown, condense, sharePercents, type BreakdownSource } from '../../lib/components/home/profit/profitBreakdown';
import type { ProfitLoss } from '../../types';

const base: ProfitLoss = {
  yearMonth: '2026-11', cardRevenue: 800, cashRevenue: 150, revenue: 1000,
  purchaseByCategory: {}, purchaseBySupplier: { 한빛유통: 300, 초록농산: 100, 바다상회: 50, 하나상사: 30, 두리상회: 20 }, purchaseCost: 500,
  grossProfit: 500, regularGross: 200, regularWithholding: 0, partTimeGross: 100, partTimeWithholding: 0, dailyLaborGross: 0,
  laborCost: 300, employerInsurance: 20, fixedExpense: 50, marketingExpense: 0, maintenanceExpense: 10, utilitiesExpense: 30,
  cardFeeExpense: 10, variableExpense: 50, operatingProfit: 80, taxReserve: 0, netProfit: 80,
};
const source = (overrides: Partial<ProfitLoss> = {}, manual = { cardRevenue: 100, cashRevenue: 50, total: 150 }): BreakdownSource =>
  ({ profitLoss: { ...base, ...overrides }, manual });

it('매출은 POS 카드·현금과 수기 입력, 결제수단 미분류로 나눈다', () => {
  const result = buildBreakdown([source()], 'revenue');
  expect(result.lines.map(line => [line.label, line.amount])).toEqual([
    ['카드', 700], ['수기 입력', 150], ['현금', 100], ['결제수단 미분류', 50],
  ]);
  expect(result.lines.map(line => line.percent)).toEqual([70, 15, 10, 5]);
  expect(result.lines[0].top).toBe(true);
  expect(result.basis).toBe('비율은 매출 대비예요');
});

it('매입 거래처가 넷을 넘으면 큰 3곳과 그 외로 묶는다', () => {
  const lines = buildBreakdown([source()], 'purchase').lines;
  expect(lines.map(line => line.label)).toEqual(['한빛유통', '초록농산', '바다상회', '그 외']);
  expect(lines[3].amount).toBe(50);
  expect(lines.filter(line => line.top).map(line => line.label)).toEqual(['한빛유통']);
});

it('직원 인건비를 모르면 그 행과 비율을 확인 필요로 두고 0원 행은 뺀다', () => {
  const lines = buildBreakdown([source({ regularGross: null, laborCost: null })], 'labor').lines;
  expect(lines).toEqual([
    { label: '파트타이머', amount: 100, percent: 100, top: true },
    { label: '직원', amount: null, percent: null, top: false },
  ]);
});

it('여러 달은 같은 이름끼리 더한다', () => {
  const lines = buildBreakdown([source(), source({ fixedExpense: 70 })], 'expense').lines;
  expect(lines[0]).toMatchObject({ label: '고정비', amount: 120 });
});

it('영업이익은 매출 대비 계산 행이며 사업주 부담(예상)을 따로 뺀다', () => {
  const lines = buildBreakdown([source()], 'profit').lines;
  expect(lines.map(line => [line.label, line.amount, line.percent])).toEqual([
    ['매출', 1000, 100], ['매입', -500, 50], ['인건비', -300, 30], ['비용', -100, 10], ['사업주 부담(예상)', -20, 2],
  ]);
  expect(lines.every(line => !line.top)).toBe(true);
});

it('비율 반올림 합은 100이고 4행 이하는 그대로 둔다', () => {
  expect(sharePercents([1, 1, 1])).toEqual([34, 33, 33]);
  expect(sharePercents([0, 0])).toEqual([null, null]);
  expect(condense([{ label: 'a', amount: 1 }, { label: 'b', amount: 0 }, { label: 'c', amount: 3 }]).map(e => e.label)).toEqual(['c', 'a']);
});
