import { Store, Attendance } from '../../types';
import { getProfitLossByMonth, getYearlyProfitLoss } from './profitLoss';
import { listCleaningItems, listCleaningLogsByDate, isCleaningItemApplicableToday } from './cleaning';
import { getAttendanceByDate } from './attendance';
import { getStoreScheduleForDay } from './schedule';
import { notifyIfEnabled } from './notifications';

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
  expense: number;
  profit: number;
  margin: number; // %
  purchaseCost: number;
  laborCost: number;
  otherExpense: number; // 고정비+변동비(비용 탭)
}

function toStorePnl(
  store: Store,
  revenue: number,
  profit: number,
  purchaseCost: number,
  laborCost: number,
  otherExpense: number,
): StorePnl {
  return {
    storeId: store.id,
    storeName: store.name,
    revenue,
    expense: revenue - profit,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
    purchaseCost,
    laborCost,
    otherExpense,
  };
}

export async function getStorePnlForMonth(store: Store, yearMonth: string): Promise<StorePnl> {
  const pnl = await getProfitLossByMonth(store.id, yearMonth, store.closing_time ?? '23:00');
  return toStorePnl(
    store, pnl.revenue, pnl.operatingProfit,
    pnl.purchaseCost, pnl.laborCost, pnl.fixedExpense + pnl.variableExpense,
  );
}

export async function getStorePnlForYear(store: Store, year: number): Promise<StorePnl> {
  const rows = await getYearlyProfitLoss(store.id, year, store.closing_time ?? '23:00');
  const revenue = rows.reduce((s, r) => s + r.data.revenue, 0);
  const profit = rows.reduce((s, r) => s + r.data.operatingProfit, 0);
  const purchaseCost = rows.reduce((s, r) => s + r.data.purchaseCost, 0);
  const laborCost = rows.reduce((s, r) => s + r.data.laborCost, 0);
  const otherExpense = rows.reduce((s, r) => s + r.data.fixedExpense + r.data.variableExpense, 0);
  return toStorePnl(store, revenue, profit, purchaseCost, laborCost, otherExpense);
}

/** 여러 매장의 이번 달/전월 손익을 한 번에 조회 (합산 카드 + 전월 대비용) */
export async function getMultiStoreMonthlyPnl(
  stores: Store[],
  yearMonth: string,
): Promise<{ current: StorePnl[]; previous: StorePnl[] }> {
  const prev = prevYearMonth(yearMonth);
  const [current, previous] = await Promise.all([
    Promise.all(stores.map(s => getStorePnlForMonth(s, yearMonth))),
    Promise.all(stores.map(s => getStorePnlForMonth(s, prev))),
  ]);
  return { current, previous };
}

/** 여러 매장의 올해/작년 손익을 한 번에 조회 (전년 대비용) */
export async function getMultiStoreYearlyPnl(
  stores: Store[],
  year: number,
): Promise<{ current: StorePnl[]; previous: StorePnl[] }> {
  const [current, previous] = await Promise.all([
    Promise.all(stores.map(s => getStorePnlForYear(s, year))),
    Promise.all(stores.map(s => getStorePnlForYear(s, year - 1))),
  ]);
  return { current, previous };
}

/** 여러 매장의 최근 N개월(또는 N년) 합산 영업이익 트렌드 — 통합 대시보드 상단 바 차트용 */
export async function getMultiStoreMonthlyTrend(
  stores: Store[],
  yearMonth: string,
  months = 6,
): Promise<{ label: string; value: number }[]> {
  const [anchorYear, anchorMonth] = yearMonth.split('-').map(Number);
  const targets: { year: number; month: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const total = anchorYear * 12 + (anchorMonth - 1) - i;
    targets.push({ year: Math.floor(total / 12), month: (total % 12) + 1 });
  }

  const sums = await Promise.all(targets.map(async ({ year, month }) => {
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    const rows = await Promise.all(stores.map(s => getStorePnlForMonth(s, ym)));
    return rows.reduce((s, r) => s + r.profit, 0);
  }));

  return targets.map((t, i) => ({ label: `${t.month}월`, value: sums[i] }));
}

/** 여러 매장의 최근 N년 합산 영업이익 트렌드 — 연도별 탭 바 차트용 */
export async function getMultiStoreYearlyTrend(
  stores: Store[],
  year: number,
  years = 6,
): Promise<{ label: string; value: number }[]> {
  const targetYears = Array.from({ length: years }, (_, i) => year - (years - 1 - i));
  const sums = await Promise.all(targetYears.map(async y => {
    const rows = await Promise.all(stores.map(s => getStorePnlForYear(s, y)));
    return rows.reduce((s, r) => s + r.profit, 0);
  }));
  return targetYears.map((y, i) => ({ label: `${y}년`, value: sums[i] }));
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export interface AttendanceStatus {
  working: number;
  late: { name: string; time: string }[];
  noShow: string[];
}

const LATE_GRACE_MIN = 0; // 1분만 늦어도 지각
const NO_SHOW_GRACE_MIN = 10;

/** 오늘 근태 현황 — 근무 중 / 지각 / 미출근 (미출근·지각은 스케줄이 잡힌 직원만 대상) */
export async function getTodayAttendanceStatus(storeId: string): Promise<AttendanceStatus> {
  const todayWeekday = new Date().getDay();
  const [records, scheduledToday] = await Promise.all([
    getAttendanceByDate(storeId, todayISO()),
    getStoreScheduleForDay(storeId, todayWeekday),
  ]);

  const byEmployee = new Map<string, Attendance[]>();
  records.forEach(r => {
    const arr = byEmployee.get(r.employee_id) ?? [];
    arr.push(r);
    byEmployee.set(r.employee_id, arr);
  });

  let working = 0;
  byEmployee.forEach(recs => {
    const sorted = [...recs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (sorted[sorted.length - 1]?.type === 'clock_in') working += 1;
  });

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const late: { name: string; time: string }[] = [];
  const noShow: string[] = [];

  for (const sched of scheduledToday) {
    if (!sched.start_time) continue;
    const startMin = timeToMinutes(sched.start_time);
    const recs = byEmployee.get(sched.employee_id) ?? [];
    const clockIn = recs.find(r => r.type === 'clock_in');

    if (clockIn) {
      const t = new Date(clockIn.timestamp);
      const clockInMin = t.getHours() * 60 + t.getMinutes();
      if (clockInMin > startMin + LATE_GRACE_MIN) {
        late.push({ name: sched.employee_name, time: t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) });
      }
    } else if (nowMinutes > startMin + NO_SHOW_GRACE_MIN) {
      noShow.push(sched.employee_name);
      const today = todayISO();
      notifyIfEnabled({
        storeId,
        settingKey: 'attendance_no_show',
        category: 'attendance',
        type: 'no_show',
        title: '미출근',
        message: `${sched.employee_name}님이 아직 출근하지 않았어요`,
        dedupeKey: `no_show:${sched.employee_id}:${today}`,
      }).catch(() => {});
    }
  }

  return { working, late, noShow };
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
  const items = await listCleaningItems(storeId);
  const monday = mondayOfThisWeek();
  const today = todayISO();

  const days = await Promise.all(WEEK_ORDER.map(async (weekday, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateISO = toISODate(date);
    const applicable = items.filter(it => isCleaningItemApplicableToday(it, weekday));
    if (dateISO > today) return { weekday, checked: 0, total: applicable.length };
    const logs = await listCleaningLogsByDate(storeId, dateISO);
    const checkedIds = new Set(logs.map(l => l.item_id));
    return { weekday, checked: applicable.filter(it => checkedIds.has(it.id)).length, total: applicable.length };
  }));

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
  const rowsByWeekday = await Promise.all(WEEK_ORDER.map(w => getStoreScheduleForDay(storeId, w)));

  return WEEK_ORDER.map((weekday, i) => {
    const rows = rowsByWeekday[i].filter(r => r.start_time && r.end_time);
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

