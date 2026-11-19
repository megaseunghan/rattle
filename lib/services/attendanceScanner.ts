import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import type { AttendanceRpcArgs, AttendanceRpcResult, AttendanceScanReceipt } from '../../types';
import { parseAttendanceQr } from '../utils/attendanceQr';
import { attendancePreflight, AttendanceCallOptions, AttendanceFailure, AttendanceResult, executeAttendance } from './attendanceTransport';

export interface AttendancePunchOptions extends AttendanceCallOptions {
  /** 같은 QR의 이전 시도가 결과불명이면 조회/성공으로 해소될 때까지 유지한다. QR·토큰은 영속화하지 않는다. */
  previousOutcome?: 'unknown';
}
export type AttendancePunchResult = { status: 'saved'; data: AttendanceScanReceipt; refreshRequired?: boolean } | AttendanceFailure;
function isReceipt(value: unknown): boolean {
  const v = value as Partial<AttendanceScanReceipt> | null;
  return !!v && typeof v.punch_id === 'string' && !!v.punch_id
    && (v.kind === 'clock_in' || v.kind === 'clock_out')
    && typeof v.punched_at === 'string' && Number.isFinite(Date.parse(v.punched_at))
    && Array.isArray(v.flags) && v.flags.every(flag => typeof flag === 'string')
    && typeof v.duplicate === 'boolean' && typeof v.employee_name === 'string';
}
/** 로그인 singleton을 import하지 않는다. 이 클라이언트와 auth API는 외부에 노출하지 않는다. */
export function createAttendanceScannerService(config: { url: string; anonKey: string }) {
  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return {
    attendanceScannerStatus(args: AttendanceRpcArgs<'attendance_scanner_status'>, options?: AttendanceCallOptions) {
      return executeAttendance<AttendanceRpcResult<'attendance_scanner_status'>>(
        () => client.rpc('attendance_scanner_status', args), options,
        data => {
          const v = data as AttendanceRpcResult<'attendance_scanner_status'> | null;
          return !!v && typeof v.scanner_id === 'string' && typeof v.store_name === 'string' && typeof v.label === 'string';
        },
      );
    },
    async punchAttendance(args: AttendanceRpcArgs<'punch_attendance'>, options: AttendancePunchOptions = {}): Promise<AttendancePunchResult> {
      const result = !args.p_scanner_token || !parseAttendanceQr(args.p_qr)
        ? attendancePreflight('ATTENDANCE_INPUT_INVALID')
        : await executeAttendance<AttendanceScanReceipt>(() => client.rpc('punch_attendance', args), options, isReceipt);
      if (result.status === 'success') return { status: 'saved', data: result.data };
      // 재시도 거절은 이번 요청에만 해당한다. 이전 요청의 커밋을 부정하지 않는다.
      return options.previousOutcome === 'unknown' ? { ...result, status: 'unknown' } : result;
    },
  };
}
let scannerService: ReturnType<typeof createAttendanceScannerService> | undefined;
function getScannerService() {
  if (!scannerService) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null;
    scannerService = createAttendanceScannerService({ url, anonKey });
  }
  return scannerService;
}
function configuredService(): ReturnType<typeof createAttendanceScannerService> | null {
  try { return getScannerService(); }
  catch { return null; } // 클라이언트 초기화 단계만 감싼다. RPC 응답 이후 실패와 혼동하지 않는다.
}
export async function attendanceScannerStatus(
  args: AttendanceRpcArgs<'attendance_scanner_status'>,
  options?: AttendanceCallOptions,
): Promise<AttendanceResult<AttendanceRpcResult<'attendance_scanner_status'>>> {
  const service = configuredService();
  return service ? service.attendanceScannerStatus(args, options) : attendancePreflight('ATTENDANCE_CONFIG_REQUIRED');
}
export async function punchAttendance(args: AttendanceRpcArgs<'punch_attendance'>, options: AttendancePunchOptions = {}): Promise<AttendancePunchResult> {
  const service = configuredService();
  if (service) return service.punchAttendance(args, options);
  const failed = attendancePreflight('ATTENDANCE_CONFIG_REQUIRED');
  return options.previousOutcome === 'unknown' ? { ...failed, status: 'unknown' } : failed;
}

/** 원격 해제의 명시적 거절만 판별한다. 출퇴근 쓰기 응답 유실은 이 값으로 실패 확정하지 않는다. */
export function isAttendanceScannerRevoked(result: AttendanceResult<unknown> | AttendancePunchResult): boolean {
  return result.status === 'server_rejected' && (result.error.code === 'ATTENDANCE_SCANNER_INVALID' || result.error.code === 'ATTENDANCE_SCANNER_REVOKED');
}

/** 기기 해제와 이전 쓰기 결과불명은 동시에 참일 수 있다. revoked를 저장 실패로 해석하지 않는다. */
export function getAttendanceScannerFailureState(result: AttendanceResult<unknown> | AttendancePunchResult): { revoked: boolean; outcomeUnknown: boolean } {
  const failed = result.status !== 'success' && result.status !== 'saved';
  return {
    revoked: failed && (result.error.code === 'ATTENDANCE_SCANNER_INVALID' || result.error.code === 'ATTENDANCE_SCANNER_REVOKED'),
    outcomeUnknown: result.status === 'unknown',
  };
}
