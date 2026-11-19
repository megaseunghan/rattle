jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn().mockResolvedValue(undefined) }));
import { invalidateCachedStore } from '../../lib/services/cacheInvalidation';
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device' }));
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../lib/supabase';
import * as enrollment from '../../lib/services/attendanceScannerEnrollment';
const storeId = '00000000-0000-0000-0000-000000000001';
const scannerId = '00000000-0000-0000-0000-000000000002';
const token = 'b'.repeat(64); const qr = `rattle-scanner:v1.${storeId}.${'a'.repeat(64)}`;
const rpc = jest.fn(); const storage = new Map<string,string>();
beforeEach(() => {
 jest.resetAllMocks(); storage.clear();
 process.env.EXPO_PUBLIC_SUPABASE_URL='https://test.invalid'; process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY='test-only';
 (createClient as jest.Mock).mockReturnValue({ rpc });
 (SecureStore.getItemAsync as jest.Mock).mockImplementation(key => Promise.resolve(storage.get(key) ?? null));
 (SecureStore.setItemAsync as jest.Mock).mockImplementation((key, value) => { storage.set(key,value); return Promise.resolve(); });
 rpc.mockImplementation(name => Promise.resolve({ data: name === 'exchange_attendance_scanner_registration'
  ? { ok:true, scanner_id:scannerId, store_id:storeId, token } : { scanner_id:scannerId, store_name:'매장',label:'매장폰' }, error:null }));
});
it('관리자 발급 RPC의 매장/라벨과 QR을 검증해 메모리 반환만 한다', async () => {
 (supabase.rpc as jest.Mock).mockResolvedValue({ data:{ registration_id:scannerId, store_id:storeId, registration_qr:qr, expires_at:'2026-11-18T02:00:00Z' }, error:null });
 expect(await enrollment.issueAttendanceScannerPairingQr({storeId,label:'매장폰'})).toEqual({status:'success',data:{qr,expiresAt:'2026-11-18T02:00:00Z'}});
 expect(supabase.rpc).toHaveBeenCalledWith('issue_attendance_scanner_registration',{p_store_id:storeId,p_label:'매장폰'});
 expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
it('익명 교환은 ok 확인 후 토큰을 SecureStore에만 보관하고 재시작 메타데이터만 반환한다', async () => {
 const result = await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr});
 expect(result).toMatchObject({status:'success', data:{scannerId,storeId,storeName:'매장',label:'매장폰'}});
 expect(JSON.stringify(result)).not.toContain(token);
 expect(rpc).toHaveBeenCalledWith('exchange_attendance_scanner_registration',{p_store_id:storeId,p_registration_qr:qr});
 expect(supabase.rpc).not.toHaveBeenCalled();
 expect(await enrollment.loadStoredAttendanceScannerRegistration()).toEqual({scannerId,storeId,storeName:'매장',label:'매장폰'});
 expect((createClient as jest.Mock).mock.calls[0][2].auth.persistSession).toBe(false);
});
it('ok:false USED는 복구 필요한 결과불명이고 저장하지 않는다', async () => {
 rpc.mockResolvedValue({data:{ok:false,error_code:'ATTENDANCE_SCANNER_REGISTRATION_USED'},error:null});
 expect(await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr})).toMatchObject({status:'unknown',error:{code:'ATTENDANCE_SCANNER_REGISTRATION_USED'}});
 expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
it('확인된 만료 거절과 네트워크 유실을 구분한다', async () => {
 rpc.mockResolvedValueOnce({data:{ok:false,error_code:'ATTENDANCE_SCANNER_REGISTRATION_EXPIRED'},error:null});
 expect(await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr})).toMatchObject({status:'server_rejected',error:{code:'ATTENDANCE_SCANNER_REGISTRATION_EXPIRED'}});
 rpc.mockRejectedValueOnce(new Error('private'));
 expect(await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr})).toMatchObject({status:'unknown'});
});
it('잘못된 QR·타매장 성공·토큰 미반환·ok 누락은 보관하지 않는다', async () => {
 expect(await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr:'invalid'})).toMatchObject({status:'preflight_failed'});
 for (const data of [{ok:true,scanner_id:scannerId,store_id:scannerId,token},{ok:true,scanner_id:scannerId,store_id:storeId},{scanner_id:scannerId,store_id:storeId,token}]) {
  rpc.mockResolvedValueOnce({data,error:null});
  expect(await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr})).toMatchObject({status:'unknown'});
 }
 expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
});
it('로컬 보관 실패는 이미 소비된 QR의 실패 확정/재교환을 하지 않는다', async () => {
 (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(new Error('private'));
 expect(await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr})).toMatchObject({status:'unknown'});
 expect(rpc).toHaveBeenCalledTimes(1);
});
it('어댑터는 토큰을 반환하지 않고 해제 코드를 유지한다', async () => {
 await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr});
 rpc.mockResolvedValue({data:null,error:{code:'P0001',message:'ATTENDANCE_SCANNER_REVOKED'}});
 expect(await enrollment.scannerStatus()).toMatchObject({status:'server_rejected',error:{code:'ATTENDANCE_SCANNER_REVOKED'}});
 const result = await enrollment.scan('rattle-punch:v1.00000000-0000-0000-0000-000000000043.000102030405060708090a0b.5c311dc26b6bd8664aa4845ac2972909','unknown');
 expect(result).toMatchObject({status:'unknown',error:{code:'ATTENDANCE_SCANNER_REVOKED'}});
 expect(JSON.stringify(result)).not.toContain(token);
});

it('활성 매장폰 토큰은 새 교환으로 덮어쓰지 않는다', async () => {
 await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr}); rpc.mockClear();
 expect(await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr})).toMatchObject({status:'preflight_failed'});
 expect(rpc.mock.calls.map(c=>c[0])).toEqual(['attendance_scanner_status']);
});
it('등록 성공 뒤 status 조회 실패도 토큰 보관은 완료이고 재시작으로 복구한다', async () => {
 rpc.mockResolvedValueOnce({data:{ok:true,scanner_id:scannerId,store_id:storeId,token},error:null}).mockRejectedValueOnce(new Error('lost'));
 expect(await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr})).toMatchObject({status:'success',refreshRequired:true});
 expect(await enrollment.loadStoredAttendanceScannerRegistration()).toMatchObject({scannerId,storeId});
 rpc.mockResolvedValue({data:{scanner_id:scannerId,store_name:'매장',label:'매장폰'},error:null});
 expect(await enrollment.scannerStatus()).toMatchObject({status:'success',data:{storeName:'매장'}});
});
it('해제 확인 뒤에만 새 등록을 허용하며 첫 교환 실패 시 기존 토큰을 보존한다', async () => {
 await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr});
 rpc.mockResolvedValueOnce({data:null,error:{code:'P0001',message:'ATTENDANCE_SCANNER_REVOKED'}})
 .mockResolvedValueOnce({data:{ok:false,error_code:'ATTENDANCE_SCANNER_REGISTRATION_EXPIRED'},error:null});
 expect(await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr})).toMatchObject({status:'server_rejected'});
 expect(await enrollment.loadStoredAttendanceScannerRegistration()).toMatchObject({scannerId});
});
it('키가 실제로 없을 때만 null이고 이전 출퇴근 결과불명은 유지한다', async () => {
 expect(await enrollment.loadStoredAttendanceScannerRegistration()).toBeNull();
 expect(await enrollment.scan('invalid','unknown')).toMatchObject({status:'unknown'});
});
it.each(['broken', '', 'null', '{}'])('손상된 등록값 %s는 지우지 않고 안전한 오류를 던진다', async raw => {
 storage.set('attendance.scanner.active',raw);
 const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
 try {
  await expect(enrollment.loadStoredAttendanceScannerRegistration()).rejects.toThrow('SCANNER_STORAGE_READ_FAILED');
  expect(storage.get('attendance.scanner.active')).toBe(raw);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith('[Attendance] SCANNER_STORAGE_READ_FAILED');
 } finally { warn.mockRestore(); }
});
it('SecureStore 접근 실패는 미등록으로 바꾸지 않고 재조회로 복구한다', async () => {
 await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr});
 const before = storage.get('attendance.scanner.active');
 (SecureStore.setItemAsync as jest.Mock).mockClear();
 (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('private-token-detail'));
 const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
 try {
  await expect(enrollment.loadStoredAttendanceScannerRegistration()).rejects.toThrow('SCANNER_STORAGE_READ_FAILED');
  expect(JSON.stringify(warn.mock.calls)).not.toContain('private-token-detail');
  expect(storage.get('attendance.scanner.active')).toBe(before);
  expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  expect(await enrollment.loadStoredAttendanceScannerRegistration()).toEqual({scannerId,storeId,storeName:'매장',label:'매장폰'});
 } finally { warn.mockRestore(); }
});

it('퇴근 자동 반영 뒤 홈/손익·실패 목록 캐시를 갱신하고 캐시 실패를 재스캔으로 바꾸지 않는다', async () => {
 await enrollment.exchangeAndStoreAttendanceScannerPairingQr({qr});
 const employeeQr='rattle-punch:v1.00000000-0000-0000-0000-000000000043.000102030405060708090a0b.5c311dc26b6bd8664aa4845ac2972909';
 rpc.mockResolvedValue({data:{punch_id:'out',kind:'clock_out',punched_at:'2026-11-18T01:00:00Z',flags:[],duplicate:false,employee_name:'김**'},error:null});
 expect(await enrollment.scan(employeeQr)).toMatchObject({status:'saved'});
 expect(invalidateCachedStore).toHaveBeenCalledWith(storeId,expect.arrayContaining(['financial','payroll','daily-work','attendance-work-issues']));
 (invalidateCachedStore as jest.Mock).mockRejectedValueOnce(new Error('cache'));
 expect(await enrollment.scan(employeeQr)).toMatchObject({status:'saved',refreshRequired:true});
});
