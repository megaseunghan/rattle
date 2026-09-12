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
}

function toStorePnl(store: Store, revenue: number, profit: number): StorePnl {
  return {
    storeId: store.id,
    storeName: store.name,
    revenue,
    expense: revenue - profit,
    profit,
    margin: revenue > 0 ? (profit / revenue) * 100 : 0,
  };
}

export async function getStorePnlForMonth(store: Store, yearMonth: string): Promise<StorePnl> {
  const pnl = await getProfitLossByMonth(store.id, yearMonth, store.closing_time ?? '23:00');
  return toStorePnl(store, pnl.revenue, pnl.operatingProfit);
}

export async function getStorePnlForYear(store: Store, year: number): Promise<StorePnl> {
  const rows = await getYearlyProfitLoss(store.id, year, store.closing_time ?? '23:00');
  const revenue = rows.reduce((s, r) => s + r.data.revenue, 0);
  const profit = rows.reduce((s, r) => s + r.data.operatingProfit, 0);
  return toStorePnl(store, revenue, profit);
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

export interface CleaningProgress {
  checked: number;
  total: number;
}

export async function getTodayCleaningProgress(storeId: string): Promise<CleaningProgress> {
  const todayWeekday = new Date().getDay();
  const [items, logs] = await Promise.all([
    listCleaningItems(storeId),
    listCleaningLogsByDate(storeId, todayISO()),
  ]);
  const applicable = items.filter(i => isCleaningItemApplicableToday(i, todayWeekday));
  const checkedIds = new Set(logs.map(l => l.item_id));
  return { checked: applicable.filter(i => checkedIds.has(i.id)).length, total: applicable.length };
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

export interface TodayScheduleSummary {
  headcount: number;
  totalHours: number;
  earliestStart: string | null; // 'HH:mm'
  latestEnd: string | null;
}

export async function getTodayScheduleSummary(storeId: string): Promise<TodayScheduleSummary> {
  const todayWeekday = new Date().getDay();
  const rows = (await getStoreScheduleForDay(storeId, todayWeekday)).filter(r => r.start_time && r.end_time);

  if (rows.length === 0) return { headcount: 0, totalHours: 0, earliestStart: null, latestEnd: null };

  const totalMinutes = rows.reduce((sum, r) => sum + (timeToMinutes(r.end_time!) - timeToMinutes(r.start_time!)), 0);
  const starts = rows.map(r => timeToMinutes(r.start_time!));
  const ends = rows.map(r => timeToMinutes(r.end_time!));
  const toHHmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  return {
    headcount: rows.length,
    totalHours: Math.round(totalMinutes / 60),
    earliestStart: toHHmm(Math.min(...starts)),
    latestEnd: toHHmm(Math.max(...ends)),
  };
}
