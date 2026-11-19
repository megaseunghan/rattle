import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { attendancePreflight, attendanceUnknown, executeAttendance, AttendanceCallOptions, AttendanceResult } from './attendanceTransport';
import { attendanceScannerStatus, isAttendanceScannerRevoked, punchAttendance, AttendancePunchResult } from './attendanceScanner';
import { ATTENDANCE_WORK_CACHE_DOMAINS } from './attendanceWorkCache';
import { invalidateCachedStore } from './cacheInvalidation';
import { scannerError } from './attendanceScannerErrors';

export interface AttendanceScannerPairingQr { qr: string; expiresAt: string }
export interface AttendanceScannerRegistration { scannerId: string; storeId: string; storeName: string; label: string }
export interface AttendanceScannerEnrollmentService {
  issueAttendanceScannerPairingQr(input: { storeId: string; label: string }, options?: AttendanceCallOptions): Promise<AttendanceResult<AttendanceScannerPairingQr>>;
  exchangeAndStoreAttendanceScannerPairingQr(input: { qr: string }, options?: AttendanceCallOptions): Promise<AttendanceResult<AttendanceScannerRegistration>>;
}
// 토큰+메타데이터를 단일 SecureStore 쓰기로 저장한다. 로그인/계정 전환 정리와 분리한다.
const REGISTRATION_KEY = 'attendance.scanner.active';
type StoredRegistration = AttendanceScannerRegistration & { token: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PAIRING_QR = /^rattle-scanner:v1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[0-9a-f]{64}$/;
function pairingStore(qr: string): string | null { return qr.length <= 180 ? PAIRING_QR.exec(qr)?.[1] ?? null : null; }
function metadata(value: StoredRegistration): AttendanceScannerRegistration {
  return { scannerId: value.scannerId, storeId: value.storeId, storeName: value.storeName, label: value.label };
}
async function loadCredential(): Promise<StoredRegistration | null> {
  const raw = await SecureStore.getItemAsync(REGISTRATION_KEY);
  if (raw === null) return null;
  const value = JSON.parse(raw) as Partial<StoredRegistration> | null;
  if (!value || typeof value.storeId !== 'string' || !UUID.test(value.storeId)
    || typeof value.scannerId !== 'string' || !UUID.test(value.scannerId)
    || typeof value.token !== 'string' || !/^[0-9a-f]{64}$/.test(value.token)
    || typeof value.storeName !== 'string' || typeof value.label !== 'string') throw new Error('SCANNER_STORAGE_INVALID');
  return value as StoredRegistration;
}
/** 키 부재만 null. 읽기/파싱 실패는 안전한 오류를 던져 미등록 라우팅을 막는다. 값은 보존하며 원격 유효성은 scannerStatus로 확인한다. */
export async function loadStoredAttendanceScannerRegistration(): Promise<AttendanceScannerRegistration | null> {
  try { const saved = await loadCredential(); return saved ? metadata(saved) : null; }
  catch {
    console.warn('[Attendance] SCANNER_STORAGE_READ_FAILED');
    throw new Error('SCANNER_STORAGE_READ_FAILED');
  }
}
function persist(value: StoredRegistration) {
  return SecureStore.setItemAsync(REGISTRATION_KEY, JSON.stringify(value), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
/** 사장/점장의 자기 앱에서만 호출한다. QR/nonce는 반환 메모리 외 저장소·캐시에 넣지 않는다. */
export async function issueAttendanceScannerPairingQr(input: { storeId: string; label: string }, options?: AttendanceCallOptions): Promise<AttendanceResult<AttendanceScannerPairingQr>> {
  if (!UUID.test(input.storeId) || !input.label.trim() || [...input.label.trim()].length > 40) return attendancePreflight('ATTENDANCE_INPUT_INVALID');
  // 익명 매장폰이 이 모듈을 import해도 관리자 singleton을 초기화하지 않는다.
  const { supabase } = require('../supabase') as typeof import('../supabase');
  const result = await executeAttendance<{ store_id: string; registration_qr: string; expires_at: string }>(() => supabase.rpc('issue_attendance_scanner_registration', {
    p_store_id: input.storeId, p_label: input.label.trim(),
  }), options, data => {
    const v = data as { store_id?: unknown; registration_qr?: unknown; expires_at?: unknown } | null;
    return !!v && v.store_id === input.storeId && typeof v.registration_qr === 'string' && pairingStore(v.registration_qr) === input.storeId
      && typeof v.expires_at === 'string' && Number.isFinite(Date.parse(v.expires_at));
  });
  return result.status === 'success' ? { status: 'success', data: { qr: result.data.registration_qr, expiresAt: result.data.expires_at } } : result;
}
let changingRegistration = false;
/** 익명 1회 교환. ok:false는 성공이 아니다. 응답 유실/USED는 관리자 확인·해제 후 새 QR로 복구한다. */
export async function exchangeAndStoreAttendanceScannerPairingQr(input: { qr: string }, options?: AttendanceCallOptions): Promise<AttendanceResult<AttendanceScannerRegistration>> {
  const storeId = pairingStore(input.qr);
  if (!storeId || changingRegistration) return attendancePreflight('ATTENDANCE_INPUT_INVALID');
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL; const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return attendancePreflight('ATTENDANCE_CONFIG_REQUIRED');
  changingRegistration = true;
  try {
    // 등록된 폰의 토큰을 새 교환으로 덮어쓰지 않는다. 원격 해제를 확인한 뒤에만 재등록한다.
    const previous = await loadCredential();
    if (previous) {
      const status = await attendanceScannerStatus({ p_scanner_token: previous.token }, options);
      if (!isAttendanceScannerRevoked(status)) {
        return status.status === 'success' ? attendancePreflight('ATTENDANCE_INPUT_INVALID') : status;
      }
    }
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const exchanged = await executeAttendance<Record<string, unknown>>(() => client.rpc('exchange_attendance_scanner_registration', {
      p_store_id: storeId, p_registration_qr: input.qr,
    }), options, data => !!data && typeof data === 'object');
    if (exchanged.status !== 'success') return exchanged;
    const data = exchanged.data;
    if (data.ok === false) {
      const error = scannerError(data.error_code);
      if (!error) return attendanceUnknown();
      return { status: error.code === 'ATTENDANCE_SCANNER_REGISTRATION_USED' ? 'unknown' : 'server_rejected', error };
    }
    if (data.ok !== true || data.store_id !== storeId || typeof data.scanner_id !== 'string' || !UUID.test(data.scanner_id)
      || typeof data.token !== 'string' || !/^[0-9a-f]{64}$/.test(data.token)) return attendanceUnknown();
    // 교환에 없는 이름/라벨은 토큰을 먼저 보관한 뒤 status로 보완한다.
    const saved: StoredRegistration = { scannerId: data.scanner_id, storeId, token: data.token, storeName: '', label: '' };
    await persist(saved);
    const status = await attendanceScannerStatus({ p_scanner_token: saved.token }, options);
    if (status.status !== 'success' || status.data.scanner_id !== saved.scannerId) return { status: 'success', data: metadata(saved), refreshRequired: true };
    saved.storeName = status.data.store_name; saved.label = status.data.label;
    try { await persist(saved); }
    catch { return { status: 'success', data: metadata(saved), refreshRequired: true }; }
    return { status: 'success', data: metadata(saved) };
  } catch { return attendanceUnknown(); }
  finally { changingRegistration = false; }
}
export async function leaveScannerMode(): Promise<'left' | 'active' | 'unknown'> {
  if (changingRegistration) return 'unknown';
  changingRegistration = true;
  try {
    const saved = await loadCredential();
    if (!saved) return 'left';
    const status = await attendanceScannerStatus({ p_scanner_token: saved.token });
    if (status.status === 'success') return 'active';
    if (!isAttendanceScannerRevoked(status)) return 'unknown';
    await SecureStore.deleteItemAsync(REGISTRATION_KEY);
    return 'left';
  } catch {
    return 'unknown';
  } finally {
    changingRegistration = false;
  }
}
/** 로그인 없는 매장폰 어댑터. 공개 반환값에 토큰을 포함하지 않는다. */
export async function scannerStatus(options?: AttendanceCallOptions): Promise<AttendanceResult<AttendanceScannerRegistration>> {
  try {
    const saved = await loadCredential();
    if (!saved) return attendancePreflight('ATTENDANCE_INPUT_INVALID');
    const result = await attendanceScannerStatus({ p_scanner_token: saved.token }, options);
    if (result.status !== 'success') return result;
    if (result.data.scanner_id !== saved.scannerId) return attendanceUnknown();
    const updated = { ...saved, storeName: result.data.store_name, label: result.data.label };
    return { status: 'success', data: metadata(updated) };
  } catch { return attendanceUnknown(); }
}
export async function scan(qr: string, previousOutcome?: 'unknown', options?: AttendanceCallOptions): Promise<AttendancePunchResult> {
  try {
    const saved = await loadCredential();
    if (!saved) { const result = attendancePreflight('ATTENDANCE_INPUT_INVALID'); return previousOutcome ? { ...result, status: 'unknown' } : result; }
    const result = await punchAttendance({ p_scanner_token: saved.token, p_qr: qr }, { ...options, previousOutcome });
    if ((result.status === 'saved' && result.data.kind === 'clock_out') || result.status === 'unknown') {
      try { await invalidateCachedStore(saved.storeId, [...ATTENDANCE_WORK_CACHE_DOMAINS]); }
      catch {
        if (result.status === 'saved') return { ...result, refreshRequired: true };
      }
    }
    return result;
  } catch { return attendanceUnknown(); }
}
