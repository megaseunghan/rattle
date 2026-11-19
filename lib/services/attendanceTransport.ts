import { scannerError, AttendanceScannerError } from './attendanceScannerErrors';
import { AttendanceError, classifyAttendanceError } from '../utils/attendanceErrors';
import { classifyStoreAccessError, StoreAccessError, STORE_ACCESS_ERROR_CATEGORIES } from './storeAccessErrors';

export type AttendanceFailure = {
  status: 'server_rejected' | 'preflight_failed' | 'unknown';
  error: AttendanceError | StoreAccessError | AttendanceScannerError;
};
export type AttendanceResult<T> = { status: 'success'; data: T; refreshRequired?: boolean } | AttendanceFailure;
export interface AttendanceCallOptions {
  /** false일 때만 요청 전 오프라인으로 확정한다. fetch 예외만으로 저장 실패를 단정하지 않는다. */
  online?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}
interface Response { data: unknown; error: unknown }
type Request = PromiseLike<Response> & { abortSignal?: (signal: AbortSignal) => PromiseLike<Response> };
export const attendanceUnknown = (): AttendanceFailure => ({ status: 'unknown', error: { code: 'ATTENDANCE_UNKNOWN', category: 'unknown' } });
export const attendancePreflight = (code: AttendanceError['code']): AttendanceFailure => ({ status: 'preflight_failed', error: { code, category: code === 'ATTENDANCE_INPUT_INVALID' ? 'input' : 'transport' } });

/** timeout/abort 후에는 서버가 이미 커밋했을 수 있다. 재시도나 원문 로깅을 하지 않는다. */
export async function executeAttendance<T>(
  request: () => Request,
  options: AttendanceCallOptions = {},
  validate?: (data: unknown) => boolean,
): Promise<AttendanceResult<T>> {
  if (options.online === false) return attendancePreflight('ATTENDANCE_OFFLINE');
  if (options.signal?.aborted) return attendancePreflight('ATTENDANCE_ABORTED');
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return attendancePreflight('ATTENDANCE_INPUT_INVALID');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop!: (result: AttendanceFailure) => void;
  const stopped = new Promise<AttendanceFailure>(resolve => { stop = resolve; });
  const abort = () => {
    stop({ status: 'unknown', error: { code: 'ATTENDANCE_ABORTED', category: 'transport' } });
    controller.abort();
  };
  options.signal?.addEventListener('abort', abort);
  timer = setTimeout(() => {
    stop({ status: 'unknown', error: { code: 'ATTENDANCE_TIMEOUT', category: 'transport' } });
    controller.abort();
  }, timeoutMs);
  try {
    let pending: PromiseLike<Response> = request();
    const cancellable = pending as Request;
    if (cancellable.abortSignal) pending = cancellable.abortSignal(controller.signal);
    const response = Promise.resolve(pending).then((result): AttendanceResult<T> => {
      if (result.error) {
        const roleError = classifyStoreAccessError(result.error);
        const raw = result.error as { code?: unknown; message?: unknown };
        const knownRoleError = [raw.code, raw.message].some(token => typeof token === 'string'
          && Object.prototype.hasOwnProperty.call(STORE_ACCESS_ERROR_CATEGORIES, token));
        const error = scannerError(raw.code) ?? scannerError(raw.message) ?? (knownRoleError ? roleError : classifyAttendanceError(result.error));
        const serverCode = (result.error as { code?: unknown }).code;
        const rejected = error.category !== 'unknown'
          || (typeof serverCode === 'string' && /^(?:[A-Z0-9]{5}|PGRST\d+)$/.test(serverCode));
        return { status: rejected ? 'server_rejected' : 'unknown', error: rejected && error.category === 'unknown'
          ? { code: 'ATTENDANCE_SERVER_REJECTED', category: 'server' } : error };
      }
      if (validate && !validate(result.data)) return attendanceUnknown();
      return { status: 'success', data: result.data as T };
    }, attendanceUnknown);
    return await Promise.race([response, stopped]);
  } catch {
    return attendanceUnknown();
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
