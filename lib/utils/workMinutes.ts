import { UserFacingError } from './error';
/** 쉼표·소수·음수를 묵시적으로 보정하지 않아 잘못 입력한 시간을 발견한다. */
export function parseWorkedMinutes(value: string, yearMonth: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(yearMonth)) throw new UserFacingError('대상 월을 확인해주세요.');
  if (!/^\d+$/.test(value.trim())) throw new UserFacingError('총 근무시간을 0 이상의 정수 분으로 입력해주세요.');
  const minutes = Number(value.trim());
  const [year, month] = yearMonth.split('-').map(Number);
  const maxMinutes = new Date(year, month, 0).getDate() * 24 * 60;
  if (!Number.isSafeInteger(minutes) || minutes > maxMinutes) {
    throw new UserFacingError(`해당 월의 총 시간(${maxMinutes.toLocaleString()}분)을 초과할 수 없어요.`);
  }
  return minutes;
}

export function formatWorkedMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return '미입력';
  return `${minutes.toLocaleString()}분 (${Math.floor(minutes / 60)}시간 ${minutes % 60}분)`;
}

export function calculateHourlyGross(minutes: number, hourlyWage: number): number {
  if (!Number.isSafeInteger(minutes) || minutes < 0 || !Number.isFinite(hourlyWage) || hourlyWage <= 0) {
    throw new UserFacingError('근무 분과 적용 시급을 확인해주세요.');
  }
  return Math.round(minutes * hourlyWage / 60);
}
