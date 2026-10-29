import { sumKnown } from '../utils/financialCoverage';
import { Store } from '../../types';
import { getFinancialSummaries } from './homeFinancialSummary';
import { fetchFinancialSummary } from '../query/financial';
import { listCleaningItems, listCleaningLogsByRange, isCleaningItemApplicableToday } from './cleaning';
import { getStoreWeeklySchedule } from './schedule';

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prevYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export interface StorePnl {
  storeId: string;
  storeName: string;
  revenue: number;
  expense: number | null;
  profit: number | null;
  margin: number | null; // %
  purchaseCost: number;
  laborCost: number | null;
  otherExpense: number; // 고정비+변동비(비용 탭)
}

function toStorePnl(
  store: Store,
  revenue: number,
  profit: number | null,
  purchaseCost: number,
  laborCost: number | null,
  otherExpense: number,
): StorePnl {
  return {
    storeId: store.id,
    storeName: store.name,
    revenue,
    expense: profit == null ? null : revenue - profit,
    profit,
    margin: profit == null ? null : revenue > 0 ? (profit / revenue) * 100 : 0,
    purchaseCost,
    laborCost,
    otherExpense,
  };
}

async function monthlyRows(stores: Store[], months: string[], scope?: string): Promise<StorePnl[][]> {
  if (scope) return Promise.all(months.map(month => Promise.all(stores.map(async store => {
    const row = await fetchFinancialSummary(scope, store.id, store.closing_time ?? '23:00', month, true);
    return toStorePnl(store, row.revenue, row.operatingProfit, row.purchaseCost, row.laborCost, row.fixedExpense + row.variableExpense);
  }))));
  const rows = await getFinancialSummaries(stores.map(s => s.id), months, true);
  return months.map(month => stores.map(store => {
    const row = rows.find(r => r.storeId === store.id && r.yearMonth === month)!;
    return toStorePnl(store, row.revenue, row.operatingProfit, row.purchaseCost, row.laborCost, row.fixedExpense + row.variableExpense);
  }));
}
function yearMonths(year: number): string[] {
  const now = new Date();
  const count = year > now.getFullYear() ? 0 : year === now.getFullYear() ? now.getMonth() + 1 : 12;
  return Array.from({ length: count }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}
function sumStoreMonths(stores: Store[], rows: StorePnl[][]): StorePnl[] {
  return stores.map((store, i) => toStorePnl(store,
    rows.reduce((sum, month) => sum + month[i].revenue, 0), sumKnown(rows.map(month => month[i].profit)),
    rows.reduce((sum, month) => sum + month[i].purchaseCost, 0), sumKnown(rows.map(month => month[i].laborCost)),
    rows.reduce((sum, month) => sum + month[i].otherExpense, 0)));
}
export async function getStorePnlForMonth(store: Store, yearMonth: string): Promise<StorePnl> {
  return (await monthlyRows([store], [yearMonth]))[0][0];
}
export async function getStorePnlForYear(store: Store, year: number): Promise<StorePnl> {
  return sumStoreMonths([store], await monthlyRows([store], yearMonths(year)))[0];
}
export async function getMultiStoreMonthlyPnl(stores: Store[], yearMonth: string, scope?: string) {
  const [current, previous] = await monthlyRows(stores, [yearMonth, prevYearMonth(yearMonth)], scope);
  return { current, previous };
}
export async function getMultiStoreYearlyPnl(stores: Store[], year: number, scope?: string) {
  const currentMonths = yearMonths(year), previousMonths = yearMonths(year - 1);
  const rows = await monthlyRows(stores, [...currentMonths, ...previousMonths], scope);
  return { current: sumStoreMonths(stores, rows.slice(0, currentMonths.length)), previous: sumStoreMonths(stores, rows.slice(currentMonths.length)) };
}
export async function getMultiStoreMonthlyTrend(stores: Store[], yearMonth: string, months = 6, scope?: string) {
  const [year, month] = yearMonth.split('-').map(Number);
  const targets = Array.from({ length: months }, (_, i) => new Date(year, month - months + i, 1));
  const rows = await monthlyRows(stores, targets.map(d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`), scope);
  return targets.map((date, i) => ({ label: `${date.getMonth() + 1}월`, value: sumKnown(rows[i].map(row => row.profit)) }));
}
export async function getMultiStoreYearlyTrend(stores: Store[], year: number, years = 6, scope?: string) {
  const targets = Array.from({ length: years }, (_, i) => year - years + 1 + i);
  const months = targets.flatMap(yearMonths);
  const rows = await monthlyRows(stores, months, scope);
  return targets.map(target => ({ label: `${target}년`, value: sumKnown(rows.filter((_, i) => months[i].startsWith(`${target}-`)).flatMap(month => month.map(row => row.profit))) }));
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** 월~일 순서의 요일 인덱스 (0=일 ~ 6=토 DB 값 기준) */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function mondayOfThisWeek(): Date {
  const d = new Date();
  const diff = (d.getDay() + 6) % 7; // 월요일까지의 거리
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface WeeklyCleaningDay {
  weekday: number; // 0=일 ~ 6=토
  checked: number;
  total: number;
}

/** 이번 주(월~일) 청소 체크 진행 현황 — 통합 대시보드 "이번 주 청소 진행률"용 */
export async function getWeeklyCleaningProgress(storeId: string): Promise<{ days: WeeklyCleaningDay[]; pct: number }> {
  const monday = mondayOfThisWeek();
  const today = todayISO();
  const [items, logs] = await Promise.all([
    listCleaningItems(storeId), listCleaningLogsByRange(storeId, toISODate(monday), today),
  ]);
  const checkedByDate = new Map<string, Set<string>>();
  for (const log of logs) {
    const checked = checkedByDate.get(log.date) ?? new Set<string>();
    checked.add(log.item_id); checkedByDate.set(log.date, checked);
  }
  const days = WEEK_ORDER.map((weekday, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateISO = toISODate(date);
    const applicable = items.filter(it => isCleaningItemApplicableToday(it, weekday));
    const checkedIds = dateISO <= today ? checkedByDate.get(dateISO) : undefined;
    return { weekday, checked: applicable.filter(it => checkedIds?.has(it.id)).length, total: applicable.length };
  });

  const totalChecked = days.reduce((s, d) => s + d.checked, 0);
  const totalTasks = days.reduce((s, d) => s + d.total, 0);
  return { days, pct: totalTasks > 0 ? Math.round((totalChecked / totalTasks) * 100) : 0 };
}

export interface WeeklyScheduleShift {
  employeeName: string;
  start: string; // 'HH:mm'
  end: string;
}

export interface WeeklyScheduleSegment {
  startMin: number;
  endMin: number;
  overlap: number; // 이 구간에 겹치는 직원 수 (0 = 빈 시간)
}

export interface WeeklyScheduleDay {
  weekday: number; // 0=일 ~ 6=토
  headcount: number;
  totalHours: number;
  shifts: WeeklyScheduleShift[];
  segments: WeeklyScheduleSegment[];
  maxOverlap: number;
}

/** 실제 근무 시간대들을 겹치는 인원 수 기준으로 겹치지 않는 구간들로 쪼갠다 (겹칠수록 진하게 표시하기 위함) */
function computeOverlapSegments(shifts: { start: number; end: number }[]): { segments: WeeklyScheduleSegment[]; maxOverlap: number } {
  if (shifts.length === 0) return { segments: [], maxOverlap: 0 };

  const breakpoints = [...new Set(shifts.flatMap(s => [s.start, s.end]))].sort((a, b) => a - b);
  const segments: WeeklyScheduleSegment[] = [];
  let maxOverlap = 0;

  for (let i = 0; i < breakpoints.length - 1; i++) {
    const startMin = breakpoints[i];
    const endMin = breakpoints[i + 1];
    const overlap = shifts.filter(s => s.start <= startMin && s.end >= endMin).length;
    maxOverlap = Math.max(maxOverlap, overlap);
    segments.push({ startMin, endMin, overlap });
  }

  return { segments, maxOverlap };
}

/** 이번 주(월~일) 요일별 실제 직원/파트타이머 근무 스케줄 — 통합 대시보드 "요일별 스케줄"용 (겹치는 시간일수록 진하게 표시) */
export async function getWeeklyScheduleBreakdown(storeId: string): Promise<WeeklyScheduleDay[]> {
  const weeklyRows = await getStoreWeeklySchedule(storeId);

  return WEEK_ORDER.map(weekday => {
    const rows = weeklyRows.filter(r => r.day_of_week === weekday && r.start_time && r.end_time);
    const shifts = rows.map(r => ({
      employeeName: r.employee_name,
      start: timeToMinutes(r.start_time!),
      end: timeToMinutes(r.end_time!),
    }));
    const totalMinutes = shifts.reduce((sum, s) => sum + (s.end - s.start), 0);
    const { segments, maxOverlap } = computeOverlapSegments(shifts);
    const toHHmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

    return {
      weekday,
      headcount: rows.length,
      totalHours: Math.round(totalMinutes / 60),
      shifts: shifts.map(s => ({ employeeName: s.employeeName, start: toHHmm(s.start), end: toHHmm(s.end) })),
      segments,
      maxOverlap,
    };
  });
}

