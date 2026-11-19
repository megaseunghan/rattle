jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../../lib/utils/secureStorageAdapter', () => ({ secureStorageAdapter: { getItem: jest.fn().mockResolvedValue('existing-admin-session'), setItem: jest.fn(), removeItem: jest.fn() } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn().mockResolvedValue(null) }));
const mockRefresh = jest.fn();
beforeEach(() => {
 jest.resetModules(); mockRefresh.mockClear();
 process.env.EXPO_PUBLIC_SUPABASE_URL='https://test.invalid'; process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY='test-key';
 const {createClient}=require('@supabase/supabase-js');
 const {secureStorageAdapter}=require('../../lib/utils/secureStorageAdapter');
 createClient.mockImplementation((_url: string,_key: string,options: {auth:{persistSession:boolean}}) => {
  if(options.auth.persistSession) { void secureStorageAdapter.getItem('existing-admin-key'); mockRefresh(); }
  return { auth: { getSession: jest.fn(), refreshSession: mockRefresh }, rpc: jest.fn().mockResolvedValue({data:{scanner_id:'00000000-0000-0000-0000-000000000002',store_name:'매장',label:'매장폰'},error:null}) };
 });
});
it('앱 모듈 import 뒤 스캐너 cold start도 auth 저장소 읽기·refresh 0회다', async () => {
 const sdk = require('@supabase/supabase-js');
 const app = require('../../lib/supabase');
 const storage = require('../../lib/utils/secureStorageAdapter').secureStorageAdapter;
 expect(sdk.createClient).not.toHaveBeenCalled();
 const enrollment = require('../../lib/services/attendanceScannerEnrollment');
 expect(await enrollment.loadStoredAttendanceScannerRegistration()).toBeNull();
 expect(storage.getItem).not.toHaveBeenCalled(); expect(mockRefresh).not.toHaveBeenCalled();
 expect(app.supabase).toBeDefined();
});
it('일반 앱의 첫 사용 때만 한 번 생성하고 인스턴스 메서드 this를 보존한다', () => {
 const sdk = require('@supabase/supabase-js');
 const client = { auth: { getSession: jest.fn() }, marker: 'client', rpc: jest.fn(function(this: {marker:string}) {return this.marker;}) };
 sdk.createClient.mockReturnValue(client);
 const { supabase } = require('../../lib/supabase');
 expect(sdk.createClient).not.toHaveBeenCalled();
 expect(supabase.rpc('test')).toBe('client');
 expect(supabase.auth).toBe(client.auth); expect(sdk.createClient).toHaveBeenCalledTimes(1);
 expect(sdk.createClient.mock.calls[0][2].auth).toMatchObject({persistSession:true,autoRefreshToken:true});
});

it('기존 관리자 세션을 읽지 않고 저장된 스캐너 토큰으로 익명 status만 호출한다', async () => {
 const sdk=require('@supabase/supabase-js');
 require('../../lib/supabase');
 const nativeStorage=require('expo-secure-store');
 nativeStorage.getItemAsync.mockResolvedValue(JSON.stringify({scannerId:'00000000-0000-0000-0000-000000000002',storeId:'00000000-0000-0000-0000-000000000001',token:'a'.repeat(64),storeName:'매장',label:'매장폰'}));
 const enrollment=require('../../lib/services/attendanceScannerEnrollment');
 expect(await enrollment.scannerStatus()).toMatchObject({status:'success'});
 expect(sdk.createClient).toHaveBeenCalledTimes(1);
 expect(sdk.createClient.mock.calls[0][2].auth).toMatchObject({persistSession:false,autoRefreshToken:false});
 expect(require('../../lib/utils/secureStorageAdapter').secureStorageAdapter.getItem).not.toHaveBeenCalled();
 expect(mockRefresh).not.toHaveBeenCalled();
});
