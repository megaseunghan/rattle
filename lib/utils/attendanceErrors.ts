/** 사용자 문구가 아닌 오류 코드 분류만 담당한다. 새 서버 코드는 여기에 추가한다. */
export const ATTENDANCE_ERROR_CATEGORIES = {
  ATTENDANCE_QR_EXPIRED: 'qr',
  ATTENDANCE_QR_INVALID: 'qr',
  ATTENDANCE_DEVICE_INACTIVE: 'device',
  ATTENDANCE_DEVICE_NOT_FOUND: 'device',
  ATTENDANCE_DEVICE_NOT_PENDING: 'device',
  ATTENDANCE_NOT_EMPLOYEE: 'permission',
  ATTENDANCE_SCANNER_INVALID: 'scanner',
  ATTENDANCE_DEVICE_RATE_LIMIT: 'rate_limit',
  ATTENDANCE_QR_RATE_LIMIT: 'rate_limit',
  ATTENDANCE_CORRECTION_RATE_LIMIT: 'rate_limit',
  ATTENDANCE_ADMIN_REQUIRED: 'permission',
  ATTENDANCE_OWNER_REQUIRED: 'permission',
  ATTENDANCE_ORDER_INVALID: 'input',
  ATTENDANCE_AUTH_REQUIRED: 'permission',
  ATTENDANCE_EMPLOYEE_REQUIRED: 'permission',
  ATTENDANCE_REASON_REQUIRED: 'input',
  ATTENDANCE_INPUT_INVALID: 'input',
  ATTENDANCE_TARGET_INVALID: 'input',
  ATTENDANCE_CORRECTION_PENDING: 'conflict',
  ATTENDANCE_CORRECTION_NOT_PENDING: 'conflict',
} as const;
export type AttendanceErrorCode = keyof typeof ATTENDANCE_ERROR_CATEGORIES;
export type AttendanceErrorCategory = typeof ATTENDANCE_ERROR_CATEGORIES[AttendanceErrorCode] | 'server' | 'unknown' | 'transport';
export interface AttendanceError {
  code: AttendanceErrorCode | 'ATTENDANCE_SERVER_REJECTED' | 'ATTENDANCE_UNKNOWN' | 'ATTENDANCE_OFFLINE' | 'ATTENDANCE_TIMEOUT' | 'ATTENDANCE_ABORTED' | 'ATTENDANCE_CONFIG_REQUIRED';
  category: AttendanceErrorCategory;
}
export function isAttendanceErrorCode(value: unknown): value is AttendanceErrorCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ATTENDANCE_ERROR_CATEGORIES, value);
}
/** DB의 code=P0001 대신 message에 있는 정해진 토큰을 읽되 원문·details·hint는 버린다. */
export function classifyAttendanceError(error: unknown): AttendanceError {
  const value = error as { code?: unknown; message?: unknown } | null;
  for (const code of [value?.code, value?.message]) {
    if (isAttendanceErrorCode(code)) return { code, category: ATTENDANCE_ERROR_CATEGORIES[code] };
    if (typeof code === 'string' && /^ATTENDANCE_[A-Z0-9_]+$/.test(code)) {
      return { code: 'ATTENDANCE_SERVER_REJECTED', category: 'server' };
    }
  }
  return { code: 'ATTENDANCE_UNKNOWN', category: 'unknown' };
}
