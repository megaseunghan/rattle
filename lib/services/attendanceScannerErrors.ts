/** 매장폰 서버 계약의 공개 오류 코드만 보존한다. SQL 원문은 전달하지 않는다. */
export const SCANNER_ERROR_CATEGORIES = {
  ATTENDANCE_SCANNER_REVOKED: 'scanner',
  ATTENDANCE_SCANNER_LABEL_INVALID: 'input',
  ATTENDANCE_SCANNER_REGISTRATION_REQUIRED: 'permission',
  ATTENDANCE_SCANNER_REGISTRATION_INVALID: 'scanner',
  ATTENDANCE_SCANNER_REGISTRATION_EXPIRED: 'scanner',
  ATTENDANCE_SCANNER_REGISTRATION_USED: 'scanner',
  ATTENDANCE_SCANNER_REGISTRATION_FORBIDDEN: 'permission',
  ATTENDANCE_SCANNER_REGISTRATION_RATE_LIMIT: 'rate_limit',
} as const;
export type AttendanceScannerErrorCode = keyof typeof SCANNER_ERROR_CATEGORIES;
export interface AttendanceScannerError {
  code: AttendanceScannerErrorCode;
  category: typeof SCANNER_ERROR_CATEGORIES[AttendanceScannerErrorCode];
}
export function scannerError(value: unknown): AttendanceScannerError | null {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(SCANNER_ERROR_CATEGORIES, value)) return null;
  const code = value as AttendanceScannerErrorCode;
  return { code, category: SCANNER_ERROR_CATEGORIES[code] };
}
