/**
 * S04 홈 손익 칸의 순수 계산(2026-11-27 확정 시안).
 * 막대는 주/월/연도 기간별 합계이고, 모르는 금액은 0원으로 바꾸지 않는다(number | null, sumKnown).
 */
import type { HomeFinancialSummary } from '../../../../types';
import { sumKnown } from '../../../utils/financialCoverage';
import { HOME_METRICS, type FinancialDay, type HomeMetric, type HomeValues } from '../../../utils/homeFinancialCard';

export type ProfitPeriod = 'week' | 'month' | 'year';
export interface PeriodBar {
  key: string;
  /** 막대 아래 이름 */
  label: string;
  /** 머리글에 쓰는 기간 이름 */
  name: string;
  values: HomeValues | null;
  current: boolean;
}

type SummaryLike = Pick<HomeFinancialSummary, 'revenue' | 'purchaseCost' | 'fixedExpense' | 'variableExpense'>
  & { laborCost: number | null; operatingProfit: number | null };

const EMPTY_VALUES: HomeValues = { profit: null, revenue: null, purchase: null, labor: null, expense: null };

export function summaryValues(summary: SummaryLike): HomeValues {
  return {
    profit: summary.operatingProfit, revenue: summary.revenue, purchase: summary.purchaseCost,
    labor: summary.laborCost, expense: summary.fixedExpense + summary.variableExpense,
  };
}

/** 여러 기간을 더한다. 하나라도 모르면 그 항목 합계도 모른다. */
export function sumValues(list: readonly HomeValues[]): HomeValues {
  if (!list.length) return EMPTY_VALUES;
  return Object.fromEntries(HOME_METRICS.map(metric => [metric, sumKnown(list.map(values => values[metric]))])) as HomeValues;
}

function shiftMonth(month: string, offset: number): string {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, m - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

/** month를 마지막으로 하는 오름차순 count개월. */
export function recentMonths(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftMonth(month, index - count + 1));
}

/** 연도 막대에 필요한 달. 올해는 이번 달까지만. */
export function yearMonths(currentMonth: string, years: number): string[] {
  const currentYear = Number(currentMonth.slice(0, 4));
  const through = Number(currentMonth.slice(5, 7));
  const months: string[] = [];
  for (let year = currentYear - years + 1; year <= currentYear; year++) {
    const last = year === currentYear ? through : 12;
    for (let m = 1; m <= last; m++) months.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

export function monthBars(months: readonly string[], byMonth: ReadonlyMap<string, HomeValues | undefined>, currentMonth: string): PeriodBar[] {
  return months.map(month => {
    const label = `${Number(month.slice(5, 7))}월`;
    const yearPrefix = month.slice(0, 4) === currentMonth.slice(0, 4) ? '' : `${month.slice(0, 4)}년 `;
    return { key: month, label, name: `${yearPrefix}${label}`, values: byMonth.get(month) ?? null, current: month === currentMonth };
  });
}

export function yearBars(currentMonth: string, years: number, byMonth: ReadonlyMap<string, HomeValues | undefined>): PeriodBar[] {
  const currentYear = Number(currentMonth.slice(0, 4));
  return Array.from({ length: years }, (_, index) => {
    const year = currentYear - years + 1 + index;
    const months = yearMonths(currentMonth, years).filter(month => month.startsWith(`${year}-`));
    const list = months.map(month => byMonth.get(month));
    const values = list.every((value): value is HomeValues => !!value) ? sumValues(list) : null;
    const current = year === currentYear;
    return { key: String(year), label: current ? '올해' : String(year), name: `${year}년`, values, current };
  });
}

/** 누적 일별 값(타임라인)을 날짜별 하루 값으로 바꾼다. 앞날이 비어 있으면 그날 값도 모른다. */
export function dailyValues(month: string, days: readonly FinancialDay[]): Map<string, HomeValues> {
  const result = new Map<string, HomeValues>();
  days.forEach((row, index) => {
    const previous = row.day === 1 ? null : days[index - 1];
    if (row.day !== 1 && previous?.day !== row.day - 1) return;
    const values = Object.fromEntries(HOME_METRICS.map(metric => {
      const now = row.values[metric];
      const base = row.day === 1 ? 0 : previous!.values[metric];
      return [metric, now == null || base == null ? null : now - base];
    })) as HomeValues;
    result.set(`${month}-${String(row.day).padStart(2, '0')}`, values);
  });
  return result;
}

function addDays(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
}

/** 그 날짜가 속한 주의 월요일(한국 달력). */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7));
}

function sumDays(daily: ReadonlyMap<string, HomeValues>, from: string, through: string): HomeValues | null {
  const list: HomeValues[] = [];
  for (let date = from; date <= through; date = addDays(date, 1)) {
    const values = daily.get(date);
    if (!values) return null;
    list.push(values);
  }
  return sumValues(list);
}

const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;

/**
 * 월요일 시작 주별 막대. 이번 주는 오늘까지. 일별 자료가 빠진 주부터 앞쪽은 보여 주지 않는다(추정하지 않음).
 */
export function weekBars(daily: ReadonlyMap<string, HomeValues>, today: string, maxWeeks: number): PeriodBar[] {
  const bars: PeriodBar[] = [];
  const thisWeek = weekStart(today);
  for (let index = 0; index < maxWeeks; index++) {
    const start = addDays(thisWeek, -7 * index);
    const end = index === 0 ? today : addDays(start, 6);
    const values = sumDays(daily, start, end);
    if (!values && index > 0) break;
    bars.unshift({ key: start, label: index === 0 ? '이번 주' : shortDate(start), name: index === 0 ? '이번 주' : `${shortDate(start)} 주`, values, current: index === 0 });
  }
  return bars;
}

/** 진행 중인 주와 비교할 지난주 같은 요일까지의 합계. */
export function previousWeekSameDays(daily: ReadonlyMap<string, HomeValues>, today: string): HomeValues | null {
  const start = addDays(weekStart(today), -7);
  return sumDays(daily, start, addDays(today, -7));
}

export interface Comparison { delta: number; percent: number | null; favorable: boolean }
/** 영업이익·매출은 늘면, 매입·인건비·비용은 줄면 좋은 쪽이다. */
export function compareAmounts(now: number | null, base: number | null, metric: HomeMetric): Comparison | null {
  if (now == null || base == null) return null;
  const delta = now - base;
  const percent = base === 0 ? null : Math.abs(delta / Math.abs(base) * 100);
  const favorable = metric === 'profit' || metric === 'revenue' ? delta >= 0 : delta <= 0;
  return { delta, percent, favorable };
}

/** 진행 중 기간의 비교 문구. 지난 기간은 바로 앞 막대 이름으로 쓴다. */
export function comparisonLabel(period: ProfitPeriod, bars: readonly PeriodBar[], index: number, currentMonth: string): string | null {
  const bar = bars[index];
  if (!bar) return null;
  if (!bar.current) return index > 0 ? `${bars[index - 1].label}보다` : null;
  if (period === 'week') return '지난주 같은 요일보다';
  if (period === 'month') return `${Number(recentMonths(currentMonth, 2)[0].slice(5, 7))}월 같은 날보다`;
  return '작년 같은 날보다';
}

/** 막대 위 짧은 금액. 만 원 단위, 만 원 미만은 원 단위. */
export function shortAmount(value: number | null): string {
  if (value == null) return '확인 필요';
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(Math.round(value));
  if (abs < 10_000) return `${sign}${abs.toLocaleString('ko-KR')}원`;
  return `${sign}${Math.round(abs / 10_000).toLocaleString('ko-KR')}만`;
}

/** 막대 높이 비율(0~1). 모르는 값은 null, 아는 값은 최소 비율을 둔다. */
export function barRatios(values: readonly (number | null)[], minimum = 0.03): (number | null)[] {
  const max = Math.max(0, ...values.map(value => Math.abs(value ?? 0)));
  return values.map(value => value == null ? null : max === 0 ? minimum : Math.max(minimum, Math.abs(value) / max));
}

export function wonText(value: number | null): string {
  if (value == null) return '확인 필요';
  return `${value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString('ko-KR')}원`;
}
