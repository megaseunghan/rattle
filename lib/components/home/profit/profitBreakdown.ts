/**
 * 손익 칸 아래 세부 목록. 실제로 저장하는 자료로만 나눈다(매출 카드·현금·수기, 매입 거래처,
 * 인건비 직원·파트타이머·일용근로자, 비용 분류). 영업이익은 매출에서 빼는 계산 행이다.
 */
import type { ProfitLoss } from '../../../../types';
import { sumKnown } from '../../../utils/financialCoverage';
import type { HomeMetric } from '../../../utils/homeFinancialCard';

export interface ManualRevenue { cardRevenue: number; cashRevenue: number; total: number }
export interface BreakdownSource { profitLoss: ProfitLoss; manual: ManualRevenue }
export interface BreakdownLine { label: string; amount: number | null; percent: number | null; top: boolean }
export interface Breakdown { lines: BreakdownLine[]; basis: string }

interface Entry { label: string; amount: number | null }
const MAX_LINES = 3;

function group(entries: readonly Entry[]): Entry[] {
  const buckets = new Map<string, (number | null)[]>();
  for (const entry of entries) buckets.set(entry.label, [...(buckets.get(entry.label) ?? []), entry.amount]);
  return [...buckets].map(([label, amounts]) => ({ label, amount: sumKnown(amounts) }));
}

function entriesFor(source: BreakdownSource, metric: Exclude<HomeMetric, 'profit'>): Entry[] {
  const row = source.profitLoss;
  if (metric === 'revenue') {
    const unclassified = row.revenue - row.cardRevenue - row.cashRevenue;
    return [
      { label: '카드', amount: row.cardRevenue - source.manual.cardRevenue },
      { label: '현금', amount: row.cashRevenue - source.manual.cashRevenue },
      { label: '수기 입력', amount: source.manual.total },
      ...(Math.abs(unclassified) > 0.01 ? [{ label: '결제수단 미분류', amount: unclassified }] : []),
    ];
  }
  if (metric === 'purchase') {
    const suppliers = Object.entries(row.purchaseBySupplier ?? {}).map(([label, amount]) => ({ label, amount }));
    const difference = row.purchaseCost - suppliers.reduce((sum, item) => sum + item.amount, 0);
    return [...suppliers, ...(Math.abs(difference) > 0.01 ? [{ label: '거래처 미분류', amount: difference }] : [])];
  }
  if (metric === 'labor') {
    return [
      { label: '직원', amount: row.regularGross },
      { label: '파트타이머', amount: row.partTimeGross },
      { label: '일용근로자', amount: row.dailyLaborGross ?? 0 },
    ];
  }
  return [
    { label: '고정비', amount: row.fixedExpense }, { label: '공과금', amount: row.utilitiesExpense },
    { label: '시설보수', amount: row.maintenanceExpense }, { label: '마케팅', amount: row.marketingExpense },
    { label: '카드 수수료(예상)', amount: row.cardFeeExpense },
  ];
}

/** 큰 순서로 3행, 넘치면 나머지를 '그 외' 한 행으로 묶는다. 0원 행은 뺀다. */
export function condense(entries: readonly Entry[]): Entry[] {
  const sorted = entries.filter(entry => entry.amount !== 0)
    .sort((a, b) => (a.amount == null ? 1 : 0) - (b.amount == null ? 1 : 0) || (b.amount ?? 0) - (a.amount ?? 0) || a.label.localeCompare(b.label));
  if (sorted.length <= MAX_LINES + 1) return sorted;
  return [...sorted.slice(0, MAX_LINES), { label: '그 외', amount: sumKnown(sorted.slice(MAX_LINES).map(entry => entry.amount)) }];
}

/** 반올림 합이 100이 되도록 큰 나머지 순으로 1씩 더한다. 모르는 금액이 있으면 각자 반올림한다. */
export function sharePercents(amounts: readonly (number | null)[]): (number | null)[] {
  const known = amounts.every(amount => amount != null);
  const total = amounts.reduce<number>((sum, amount) => sum + Math.abs(amount ?? 0), 0);
  if (total === 0) return amounts.map(() => null);
  const raw = amounts.map(amount => amount == null ? null : Math.abs(amount) / total * 100);
  if (!known) return raw.map(value => value == null ? null : Math.round(value));
  const floors = raw.map(value => Math.floor(value!));
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  raw.map((value, index) => [value! - floors[index], index] as const)
    .sort((a, b) => b[0] - a[0])
    .forEach(([, index]) => { if (left > 0) { floors[index] += 1; left -= 1; } });
  return floors;
}

function profitLines(sources: readonly BreakdownSource[]): BreakdownLine[] {
  const sum = (pick: (row: ProfitLoss) => number | null) => sumKnown(sources.map(source => pick(source.profitLoss)));
  const revenue = sum(row => row.revenue);
  const employer = sum(row => row.employerInsurance ?? 0);
  const negative = (value: number | null) => value == null ? null : -value;
  const lines: Entry[] = [
    { label: '매출', amount: revenue },
    { label: '매입', amount: negative(sum(row => row.purchaseCost)) },
    { label: '인건비', amount: negative(sum(row => row.laborCost)) },
    { label: '비용', amount: negative(sum(row => row.fixedExpense + row.variableExpense)) },
    ...(employer !== 0 ? [{ label: '사업주 부담(예상)', amount: negative(employer) }] : []),
  ];
  return lines.map(line => ({
    ...line, top: false,
    percent: line.amount == null || revenue == null || revenue === 0 ? null : Math.round(Math.abs(line.amount) / Math.abs(revenue) * 100),
  }));
}

const BASIS: Record<HomeMetric, string> = {
  profit: '비율은 매출 대비예요', revenue: '비율은 매출 대비예요', purchase: '비율은 매입 대비예요',
  labor: '비율은 인건비 대비예요', expense: '비율은 비용 대비예요',
};

/** 고른 기간(여러 달이면 모두 더함)의 세부 목록. */
export function buildBreakdown(sources: readonly BreakdownSource[], metric: HomeMetric): Breakdown {
  if (metric === 'profit') return { lines: profitLines(sources), basis: BASIS.profit };
  const entries = condense(group(sources.flatMap(source => entriesFor(source, metric))));
  const percents = sharePercents(entries.map(entry => entry.amount));
  const best = Math.max(-1, ...percents.map((value, index) => entries[index].label === '그 외' ? -1 : value ?? -1));
  const topIndex = best > 0 ? percents.indexOf(best) : -1;
  return {
    lines: entries.map((entry, index) => ({ ...entry, percent: percents[index], top: index === topIndex })),
    basis: BASIS[metric],
  };
}
