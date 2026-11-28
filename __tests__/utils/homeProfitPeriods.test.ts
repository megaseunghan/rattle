import {
  barRatios, compareAmounts, comparisonLabel, dailyValues, monthBars, previousWeekSameDays, recentMonths,
  shortAmount, summaryValues, sumValues, weekBars, weekStart, yearBars, yearMonths,
} from '../../lib/components/home/profit/profitPeriods';
import type { FinancialDay, HomeValues } from '../../lib/utils/homeFinancialCard';

const values = (revenue: number | null, labor: number | null = 0): HomeValues => ({
  revenue, purchase: 0, labor, expense: 0, profit: revenue == null || labor == null ? null : revenue - labor,
});
const cumulative = (month: string, perDay: number[]): FinancialDay[] => {
  let total = 0;
  return perDay.map((amount, index) => { total += amount; return { day: index + 1, hasRecords: true, values: values(total) }; });
};

describe('기간 목록', () => {
  it('이번 달을 마지막으로 하는 최근 달을 연도를 넘어 만든다', () => {
    expect(recentMonths('2026-02', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
  it('연도 막대는 올해 이번 달까지만 달을 모은다', () => {
    const months = yearMonths('2026-03', 2);
    expect(months[0]).toBe('2025-01'); expect(months.at(-1)).toBe('2026-03'); expect(months).toHaveLength(15);
  });
});

describe('합계는 모르는 값을 0원으로 바꾸지 않는다', () => {
  it('한 달이라도 인건비를 모르면 합계 인건비·영업이익도 모른다', () => {
    const total = sumValues([values(100, 10), values(200, null)]);
    expect(total.revenue).toBe(300); expect(total.labor).toBeNull(); expect(total.profit).toBeNull();
  });
  it('서버 요약의 비용은 고정비와 변동비를 더한다', () => {
    expect(summaryValues({ revenue: 10, purchaseCost: 3, laborCost: null, fixedExpense: 2, variableExpense: 1, operatingProfit: null }))
      .toEqual({ revenue: 10, purchase: 3, labor: null, expense: 3, profit: null });
  });
  it('연도 막대는 빠진 달이 있으면 그 해를 모름으로 둔다', () => {
    const byMonth = new Map(yearMonths('2026-02', 2).map(month => [month, values(1)] as const));
    byMonth.delete('2025-07');
    const bars = yearBars('2026-02', 2, byMonth);
    expect(bars.map(bar => bar.label)).toEqual(['2025', '올해']);
    expect(bars[0].values).toBeNull(); expect(bars[1].values?.revenue).toBe(2); expect(bars[1].current).toBe(true);
  });
  it('월 막대는 다른 해의 달에 연도를 붙여 부른다', () => {
    const bars = monthBars(['2025-12', '2026-01'], new Map([['2026-01', values(5)]]), '2026-01');
    expect(bars.map(bar => bar.name)).toEqual(['2025년 12월', '1월']);
    expect(bars[0].values).toBeNull();
  });
});

describe('주별 막대', () => {
  it('누적 일별 값을 하루 값으로 바꾸고 끊긴 날은 비운다', () => {
    const days = cumulative('2026-11', [100, 50, 25]);
    const daily = dailyValues('2026-11', [days[0], days[2]]);
    expect(daily.get('2026-11-01')?.revenue).toBe(100);
    expect(daily.has('2026-11-03')).toBe(false);
  });
  it('월요일 시작 주로 묶고, 일별 자료가 빠진 주부터 앞은 만들지 않는다', () => {
    expect(weekStart('2026-11-28')).toBe('2026-11-23');
    const daily = dailyValues('2026-11', cumulative('2026-11', Array.from({ length: 28 }, () => 10)));
    const bars = weekBars(daily, '2026-11-28', 8);
    expect(bars.map(bar => bar.key)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']);
    expect(bars.at(-1)).toMatchObject({ label: '이번 주', current: true });
    expect(bars.at(-1)?.values?.revenue).toBe(60);
    expect(bars[0].name).toBe('11/2 주');
  });
  it('진행 중인 주는 지난주 같은 요일까지와 비교한다', () => {
    const daily = dailyValues('2026-11', cumulative('2026-11', Array.from({ length: 28 }, (_, i) => i + 1)));
    // 11/16(월)~11/21(토) = 16+17+18+19+20+21
    expect(previousWeekSameDays(daily, '2026-11-28')?.revenue).toBe(111);
  });
});

describe('비교', () => {
  it('비용 항목은 줄면 좋은 쪽이고 앞 기간이 0이면 비율을 비운다', () => {
    expect(compareAmounts(80, 100, 'labor')).toEqual({ delta: -20, percent: 20, favorable: true });
    expect(compareAmounts(80, 100, 'revenue')?.favorable).toBe(false);
    expect(compareAmounts(10, 0, 'profit')).toEqual({ delta: 10, percent: null, favorable: true });
    expect(compareAmounts(null, 100, 'profit')).toBeNull();
  });
  it('진행 중 기간은 앞 기간 같은 날과, 지난 기간은 바로 앞 막대와 비교한다', () => {
    const bars = monthBars(['2026-09', '2026-10', '2026-11'], new Map(), '2026-11');
    expect(comparisonLabel('month', bars, 2, '2026-11')).toBe('10월 같은 날보다');
    expect(comparisonLabel('month', bars, 1, '2026-11')).toBe('9월보다');
    expect(comparisonLabel('month', bars, 0, '2026-11')).toBeNull();
    expect(comparisonLabel('week', [{ ...bars[2] }], 0, '2026-11')).toBe('지난주 같은 요일보다');
  });
});

describe('막대 표시', () => {
  it('만 원 단위로 줄이고 모르는 값은 확인 필요로 둔다', () => {
    expect(shortAmount(3_412_000)).toBe('341만'); expect(shortAmount(-25_000)).toBe('−3만');
    expect(shortAmount(9_000)).toBe('9,000원'); expect(shortAmount(null)).toBe('확인 필요');
  });
  it('가장 큰 막대 기준 비율이며 모르는 막대는 높이가 없다', () => {
    expect(barRatios([50, 100, null, 0])).toEqual([0.5, 1, null, 0.03]);
    expect(barRatios([-200, 100])).toEqual([1, 0.5]);
  });
});
