jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../../lib/supabase', () => { throw new Error('LOGIN_SINGLETON_FORBIDDEN'); });
import { createClient } from '@supabase/supabase-js';
import { createAttendanceScannerService } from '../../lib/services/attendanceScanner';

const qr = 'rattle-punch:v1.00000000-0000-0000-0000-000000000043.000102030405060708090a0b.5c311dc26b6bd8664aa4845ac2972909';
const args = { p_scanner_token: 'test-token', p_qr: qr };
const saved = { punch_id: 'p', kind: 'clock_in', punched_at: '2026-11-17T01:00:00Z', flags: [], duplicate: false, employee_name: '김**' };
const rpc = jest.fn();
let network: jest.SpyInstance;
beforeEach(() => {
  jest.clearAllMocks();
  (createClient as jest.Mock).mockReturnValue({ rpc });
  network = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NETWORK_FORBIDDEN'));
});
afterEach(() => { expect(network).not.toHaveBeenCalled(); network.mockRestore(); jest.useRealTimers(); });
const service = () => createAttendanceScannerService({ url: 'https://test.invalid', anonKey: 'test-anon-key' });
it('세션 없는 별도 클라이언트만 생성하며 auth API를 쓰지 않는다', async () => {
  rpc.mockResolvedValue({ data: { scanner_id: 's', store_name: '매장', label: '매장폰' }, error: null });
  const scanner = service();
  expect(createClient).toHaveBeenCalledWith('https://test.invalid', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  expect(await scanner.attendanceScannerStatus({ p_scanner_token: 'test-token' })).toMatchObject({ status: 'success', data: { scanner_id: 's' } });
  expect(rpc).toHaveBeenCalledWith('attendance_scanner_status', { p_scanner_token: 'test-token' });
});
it('저장 성공과 중복 성공을 그대로 반환한다', async () => {
  rpc.mockResolvedValueOnce({ data: saved, error: null }).mockResolvedValueOnce({ data: { ...saved, duplicate: true }, error: null });
  const scanner = service();
  expect(await scanner.punchAttendance(args)).toEqual({ status: 'saved', data: saved });
  expect(await scanner.punchAttendance(args)).toMatchObject({ status: 'saved', data: { punch_id: 'p', duplicate: true } });
  expect(rpc).toHaveBeenCalledTimes(2);
});
it('서버 오류 코드 거절은 저장 안 됨으로 원문 없이 반환한다', async () => {
  rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'ATTENDANCE_QR_EXPIRED', details: 'private' } });
  expect(await service().punchAttendance(args)).toEqual({ status: 'server_rejected', error: { code: 'ATTENDANCE_QR_EXPIRED', category: 'qr' } });
});
it('알 수 없는 ATTENDANCE 오류도 서버 거절로 분류한다', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'ATTENDANCE_NEW_POLICY_ERROR' } });
  expect(await service().punchAttendance(args)).toEqual({ status: 'server_rejected', error: { code: 'ATTENDANCE_SERVER_REJECTED', category: 'server' } });
});
it('확실한 오프라인은 RPC 전 실패로 반환한다', async () => {
  expect(await service().punchAttendance(args, { online: false })).toMatchObject({ status: 'preflight_failed' });
  expect(rpc).not.toHaveBeenCalled();
});
it('잘못된 QR은 RPC 전 실패로 반환한다', async () => {
  expect(await service().punchAttendance({ ...args, p_qr: 'not-qr' })).toMatchObject({ status: 'preflight_failed' });
  expect(rpc).not.toHaveBeenCalled();
});
it('요청 시작 후 네트워크 예외는 저장 여부 불명이고 자동 재시도하지 않는다', async () => {
  rpc.mockRejectedValue(new Error('private token secret'));
  expect(await service().punchAttendance(args)).toEqual({ status: 'unknown', error: { code: 'ATTENDANCE_UNKNOWN', category: 'unknown' } });
  expect(rpc).toHaveBeenCalledTimes(1);
});
it.each(['ATTENDANCE_QR_INVALID', 'ATTENDANCE_QR_EXPIRED', 'ATTENDANCE_SCANNER_INVALID'])('응답 유실 뒤 %s 거절도 이전 저장 여부를 실패로 확정하지 않는다', async message => {
  rpc.mockResolvedValue({ data: null, error: { message } });
  expect(await service().punchAttendance(args, { previousOutcome: 'unknown' })).toMatchObject({ status: 'unknown', error: { code: message } });
});
it('응답 유실 뒤 오프라인이어도 저장 안 됨으로 되돌리지 않는다', async () => {
  expect(await service().punchAttendance(args, { online: false, previousOutcome: 'unknown' })).toMatchObject({ status: 'unknown' });
  expect(rpc).not.toHaveBeenCalled();
});
it('시간 초과 후 늦은 성공 응답을 새 결과로 방출하지 않는다', async () => {
  jest.useFakeTimers();
  let resolve!: (value: unknown) => void;
  rpc.mockReturnValue(new Promise(r => { resolve = r; }));
  const result = service().punchAttendance(args, { timeoutMs: 100 });
  await jest.advanceTimersByTimeAsync(100);
  expect(await result).toMatchObject({ status: 'unknown', error: { code: 'ATTENDANCE_TIMEOUT' } });
  resolve({ data: saved, error: null });
  expect(rpc).toHaveBeenCalledTimes(1);
});
it('불완전한 성공 응답은 저장됨으로 단정하지 않는다', async () => {
  rpc.mockResolvedValue({ data: { punch_id: 'p' }, error: null });
  expect(await service().punchAttendance(args)).toMatchObject({ status: 'unknown' });
});
it('응답 유실 뒤 같은 QR 성공 재시도는 저장됨으로 확정한다', async () => {
  rpc.mockResolvedValue({ data: { ...saved, duplicate: true }, error: null });
  expect(await service().punchAttendance(args, { previousOutcome: 'unknown' })).toMatchObject({ status: 'saved', data: { punch_id: 'p', duplicate: true } });
});

it('명시적 서버 토큰 거절만 등록 해제로 판별하고 네트워크 실패·이전 결과불명은 보존한다', () => {
  const { isAttendanceScannerRevoked } = require('../../lib/services/attendanceScanner');
  expect(isAttendanceScannerRevoked({ status: 'server_rejected', error: { code: 'ATTENDANCE_SCANNER_INVALID', category: 'scanner' } })).toBe(true);
  expect(isAttendanceScannerRevoked({ status: 'unknown', error: { code: 'ATTENDANCE_SCANNER_INVALID', category: 'scanner' } })).toBe(false);
  expect(isAttendanceScannerRevoked({ status: 'unknown', error: { code: 'ATTENDANCE_TIMEOUT', category: 'transport' } })).toBe(false);
  expect(isAttendanceScannerRevoked({ status: 'server_rejected', error: { code: 'ATTENDANCE_SCANNER_REVOKED', category: 'scanner' } })).toBe(true);
});

it('해제된 스캐너와 이전 스캔 결과불명을 서로 다른 상태로 반환한다', () => {
  const { getAttendanceScannerFailureState } = require('../../lib/services/attendanceScanner');
  expect(getAttendanceScannerFailureState({status:'unknown',error:{code:'ATTENDANCE_SCANNER_REVOKED'}})).toEqual({revoked:true,outcomeUnknown:true});
  expect(getAttendanceScannerFailureState({status:'server_rejected',error:{code:'ATTENDANCE_SCANNER_INVALID'}})).toEqual({revoked:true,outcomeUnknown:false});
  expect(getAttendanceScannerFailureState({status:'unknown',error:{code:'ATTENDANCE_TIMEOUT'}})).toEqual({revoked:false,outcomeUnknown:true});
});
it('A 스캔 결과불명을 보존한 채 별도 B 스캔 요청은 서비스가 차단하지 않는다', async () => {
  rpc.mockRejectedValueOnce(new Error('lost')).mockResolvedValueOnce({data:saved,error:null});
  const scanner = service();
  expect(await scanner.punchAttendance(args)).toMatchObject({status:'unknown'});
  const b = 'rattle-punch:v1.00000000-0000-0000-0000-000000000044.000102030405060708090a0b.5c311dc26b6bd8664aa4845ac2972909';
  expect(await scanner.punchAttendance({...args,p_qr:b})).toMatchObject({status:'saved'});
  expect(rpc).toHaveBeenCalledTimes(2);
});
