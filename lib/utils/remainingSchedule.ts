import { ScheduleDayInput } from '../../types';

/** KST 월~일에 시작하는 확정 근무 중 종료 전인 근무일 수. 불완전한 시간은 미확인. */
export function remainingScheduledDays(schedule: ScheduleDayInput[], now: Date): number | null {
  if (!schedule.length || !Number.isFinite(now.getTime())) return null;
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const monday = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  const minutes = (time: string | null): number | null => {
    if (!time || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return null;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  let remaining = 0;
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + i);
    const day = schedule.find(row => row.day_of_week === date.getUTCDay());
    if (!day?.is_working) continue;
    const start = minutes(day.start_time), end = minutes(day.end_time);
    if (start === null || end === null || start === end) return null;
    const endAt = date.getTime() + end * 60 * 1000 + (end < start ? 86400000 : 0);
    if (endAt > kst.getTime()) remaining++;
  }
  return remaining;
}
