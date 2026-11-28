/** S04 홈 출퇴근 칸에 보여 줄 문구. 출근 전·근무 중·근무 끝 세 상태다. */
import { attendanceTime } from '../../../hooks/attendanceTime';

export type AttendanceAction = 'in' | 'out' | null;
export interface AttendanceDisplay { label: string; value: string; action: AttendanceAction }
interface Punch { punched_at: string }
interface ScheduleTime { start_time: string | null; end_time: string | null }

/** 경과 시간을 'n시간 m분'으로. 음수(기기 시각 차이)는 0분으로 본다. */
export function workedText(startIso: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(startIso)) / 60_000));
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}

export function attendanceDisplay(input: { start?: Punch; end?: Punch; schedule?: ScheduleTime | null }, nowMs: number): AttendanceDisplay {
  const { start, end, schedule } = input;
  if (start && end) return { label: '오늘 근무 끝', value: `${attendanceTime(start.punched_at)} ~ ${attendanceTime(end.punched_at)}`, action: null };
  if (start) return { label: `출근 ${attendanceTime(start.punched_at)} · 근무 중`, value: workedText(start.punched_at, nowMs), action: 'out' };
  const planned = schedule?.start_time && schedule.end_time ? `${schedule.start_time.slice(0, 5)} ~ ${schedule.end_time.slice(0, 5)}` : '정해진 근무가 없어요';
  return { label: '오늘 근무', value: planned, action: 'in' };
}
