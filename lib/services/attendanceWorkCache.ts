/** 로그인 없는 스캐너도 안전하게 import하는 순수 캐시 계약. 인증 singleton 참조 금지. */
export const ATTENDANCE_WORK_CACHE_DOMAINS = [
  'attendance-work-record', 'attendance-work-issues', 'attendance-punches', 'shared-attendance', 'daily-work', 'payroll', 'financial',
] as const;
