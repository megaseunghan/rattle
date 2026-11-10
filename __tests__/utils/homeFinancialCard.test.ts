import { financialPeriod, buildCumulativeDays, comparisonText, basisPath } from '../../lib/utils/homeFinancialCard';
it('한국 날짜와 전월 말일을 기준으로 같은 기간을 정한다', () => {
  expect(financialPeriod(new Date('2026-03-30T16:00:00Z'))).toEqual({ date: '2026-03-31', month: '2026-03', previousMonth: '2026-02', day: 31, previousDay: 28 });
});
it('0원 기록과 기록 없음, 미래 날짜를 구분한다', () => {
  const rows = buildCumulativeDays('2026-11', 3, [{ date: '2026-11-02', revenue: 0, purchase: 100 }, { date: '2026-11-04', revenue: 999, purchase: 999 }]);
  expect(rows.map(r => r.values.revenue)).toEqual([0, 0, 0]);
  expect(rows[2].values.purchase).toBe(100);
  expect(rows[2].values.labor).toBeNull();
  expect(rows[0].hasRecords).toBe(false);
  expect(rows[2].hasRecords).toBe(true);
});
it('분모가 0이면 가짜 퍼센트를 표시하지 않는다', () => {
  expect(comparisonText(100000, 0)).toBe('+100,000원 (—%)');
  expect(comparisonText(-100, 100)).toBe('−200원 (-200.0%)');
  expect(comparisonText(100, null)).toBeNull();
});
it('부드러운 추세는 시작과 끝의 실제 좌표를 유지한다', () => {
  const path = basisPath([{ x: 0, y: 10 }, { x: 10, y: 40 }, { x: 20, y: 20 }]);
  expect(path.startsWith('M 0 10')).toBe(true);
  expect(path.endsWith('L 20 20')).toBe(true);
  expect(path).not.toMatch(/NaN|Infinity/);
});

import { financialChartDays, type FinancialDay, type HomeMetric } from '../../lib/utils/homeFinancialCard';
const chartRows = (values: (number | null)[]): FinancialDay[] => values.map((value, index) => ({
  day: index + 1, hasRecords: true,
  values: { profit: value, revenue: value, purchase: value, labor: value, expense: value },
}));
it.each<HomeMetric>(['revenue', 'purchase', 'labor', 'expense'])('%s 그래프는 누적에서 해당 일자 금액만 구하고 원본은 보존한다', metric => {
  const source = chartRows([100, 350, 350, 300]);
  expect(financialChartDays(source, metric).map(row => row.values[metric])).toEqual([100, 250, 0, -50]);
  expect(source.map(row => row.values[metric])).toEqual([100, 350, 350, 300]);
});
it('영업이익은 누적을 유지한다', () => {
  const source = chartRows([-100, 50, 75]);
  expect(financialChartDays(source, 'profit')).toBe(source);
});
it('이전 일자 값이 미확인이거나 날짜가 누락되면 일별 금액을 추정하지 않는다', () => {
  expect(financialChartDays(chartRows([100, null, 350, 400]), 'labor').map(row => row.values.labor)).toEqual([100, null, null, 50]);
  const source = chartRows([100, 350, 400]);
  expect(financialChartDays([source[0], source[2]], 'expense').map(row => row.values.expense)).toEqual([100, null]);
});
