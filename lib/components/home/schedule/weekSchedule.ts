/**
 * S04 홈 근무표의 순수 계산. 고정 근무(요일별 employee_schedules)를 이번 주 날짜에 놓는다.
 * 저장된 근무만 쓰고, 시간이 없는 근무는 막대를 지어내지 않고 뺀다.
 */
import type { Employee, EmployeeSchedule } from '../../../../types';

export type CrewType = 'staff' | 'part';
export type ShiftState = 'on' | 'wait' | 'done' | 'plan';
export type DayKind = 'past' | 'today' | 'future';
export interface WeekDay { date: string; dow: number; letter: string; kind: DayKind }
export interface CrewRow { employeeId: string; name: string; type: CrewType; start: number; end: number; label: string }

const LETTERS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY = 24 * 60;
export const DEFAULT_AXIS = { start: 9 * 60, end: 22 * 60 } as const;

function addDays(date: string, offset: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
}

/** 월요일부터 일요일까지 이번 주. */
export function weekDays(today: string): WeekDay[] {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  const monday = addDays(today, -((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(monday, index);
    const day = (index + 1) % 7;
    return { date, dow: day, letter: LETTERS[day], kind: date < today ? 'past' : date === today ? 'today' : 'future' };
  });
}

export function toMinutes(time: string | null | undefined): number | null {
  const match = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= DAY ? minutes : null;
}

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** 그 요일 근무자. 재직 중인 직원만, 출근 순. 자정을 넘기는 근무는 다음 날 시각까지 이어 그린다. */
export function crewForDay(schedules: readonly EmployeeSchedule[], employees: readonly Employee[], dow: number): CrewRow[] {
  const byId = new Map(employees.filter(employee => employee.is_active).map(employee => [employee.id, employee]));
  const rows: CrewRow[] = [];
  for (const schedule of schedules) {
    const employee = byId.get(schedule.employee_id);
    const start = toMinutes(schedule.start_time), rawEnd = toMinutes(schedule.end_time);
    if (!employee || !schedule.is_working || schedule.day_of_week !== dow || start == null || rawEnd == null) continue;
    const end = rawEnd <= start ? rawEnd + DAY : rawEnd;
    rows.push({ employeeId: employee.id, name: employee.name, type: employee.employment_type === 'part_time' ? 'part' : 'staff',
      start, end, label: `${hhmm(start)}–${hhmm(end)}` });
  }
  return rows.sort((a, b) => a.start - b.start || a.end - b.end || a.name.localeCompare(b.name));
}

/** 이번 주 전체 근무의 가장 이른 출근~가장 늦은 퇴근(정시로 넓힘). 근무가 없으면 기본 9~22시. */
export function axisRange(rows: readonly CrewRow[]): { start: number; end: number } {
  if (!rows.length) return { ...DEFAULT_AXIS };
  const start = Math.floor(Math.min(...rows.map(row => row.start)) / 60) * 60;
  let end = Math.ceil(Math.max(...rows.map(row => row.end)) / 60) * 60;
  if (end - start < 180) end = start + 180;
  return { start, end };
}

/** 3시간 간격 눈금(시). */
export function axisTicks(range: { start: number; end: number }): { minutes: number; label: string }[] {
  const ticks: { minutes: number; label: string }[] = [];
  for (let minutes = range.start; minutes <= range.end; minutes += 180) ticks.push({ minutes, label: String((minutes / 60) % 24) });
  return ticks;
}

export function shiftState(row: CrewRow, kind: DayKind, nowMinutes: number): ShiftState {
  if (kind === 'past') return 'done';
  if (kind === 'future') return 'plan';
  return nowMinutes < row.start ? 'wait' : nowMinutes >= row.end ? 'done' : 'on';
}

export function position(range: { start: number; end: number }, row: Pick<CrewRow, 'start' | 'end'>): { left: number; width: number } {
  const span = range.end - range.start;
  const left = Math.max(0, (row.start - range.start) / span);
  const right = Math.min(1, (row.end - range.start) / span);
  return { left, width: Math.max(0, right - left) };
}

/** 한국 시각 기준 오늘 날짜와 자정 이후 분. */
export function kstNow(nowMs = Date.now()): { date: string; minutes: number } {
  const shifted = new Date(nowMs + 9 * 3_600_000);
  return { date: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}
