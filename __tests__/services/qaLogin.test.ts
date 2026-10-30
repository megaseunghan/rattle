import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';
import { isQaLoginEnabled, signInForQa, getInitialQaRole } from '../../lib/services/qaLogin';
jest.mock('expo-constants', () => ({ __esModule: true, default: { platform: { ios: { buildNumber: '900002' } } } }));
jest.mock('expo-device', () => ({ isDevice: false }));
jest.mock('@react-native-async-storage/async-storage', () => ({ setItem: jest.fn(), getItem: jest.fn() }));
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { setSession: jest.fn() } } }));
const originalFetch = globalThis.fetch;
const originalOS = Platform.OS;
const originalEnv = { enabled: process.env.EXPO_PUBLIC_QA_LOGIN, token: process.env.EXPO_PUBLIC_QA_BROKER_TOKEN, url: process.env.EXPO_PUBLIC_SUPABASE_URL };
beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  process.env.EXPO_PUBLIC_QA_LOGIN = '1';
  process.env.EXPO_PUBLIC_QA_BROKER_TOKEN = 'local-test-token';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co';
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  Object.defineProperty(Device, 'isDevice', { value: false, configurable: true });
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (supabase.auth.setSession as jest.Mock).mockResolvedValue({ error: null });
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ projectUrl: 'https://fixture.supabase.co', storeId: 'demo', session: { access_token: 'test-access', refresh_token: 'test-refresh' } }) });
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true });
  for (const [key, value] of Object.entries({ EXPO_PUBLIC_QA_LOGIN: originalEnv.enabled, EXPO_PUBLIC_QA_BROKER_TOKEN: originalEnv.token, EXPO_PUBLIC_SUPABASE_URL: originalEnv.url })) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
it.each(['flag', 'device', 'platform', 'token'])('%s 조건이 다르면 테스트 로그인을 차단한다', async condition => {
  if (condition === 'flag') delete process.env.EXPO_PUBLIC_QA_LOGIN;
  if (condition === 'device') Object.defineProperty(Device, 'isDevice', { value: true });
  if (condition === 'platform') Object.defineProperty(Platform, 'OS', { value: 'android' });
  if (condition === 'token') delete process.env.EXPO_PUBLIC_QA_BROKER_TOKEN;
  expect(isQaLoginEnabled()).toBe(false);
  await expect(signInForQa('admin')).rejects.toThrow('전용 시뮬레이터');
  expect(globalThis.fetch).not.toHaveBeenCalled();
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});
it('loopback broker에서만 세션을 받아 매장 선택 후 정상 인증 저장소로 전달한다', async () => {
  await signInForQa('part_time');
  expect(globalThis.fetch).toHaveBeenCalledWith('http://127.0.0.1:18765/session', expect.objectContaining({ body: JSON.stringify({ role: 'part_time' }), headers: expect.objectContaining({ Authorization: 'Bearer local-test-token' }) }));
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('LAST_STORE_ID', 'demo');
  expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: 'test-access', refresh_token: 'test-refresh' });
  expect((AsyncStorage.setItem as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan((supabase.auth.setSession as jest.Mock).mock.invocationCallOrder[0]);
});
it('다른 프로젝트 응답이면 세션을 설치하지 않는다', async () => {
  (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ projectUrl: 'https://wrong.supabase.co', storeId: 'demo', session: { access_token: 'access', refresh_token: 'refresh' } }) });
  await expect(signInForQa('regular')).rejects.toThrow('일치하지');
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});
it('broker 실패를 빈 로그인 성공으로 처리하지 않는다', async () => {
  (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: false });
  await expect(signInForQa('admin')).rejects.toThrow('서버');
  expect(supabase.auth.setSession).not.toHaveBeenCalled();
});

it('역할별 QA 빌드의 첫 실행에만 자동 로그인하고 로그아웃 뒤에는 선택할 수 있다', async () => {
  expect(await getInitialQaRole()).toBe('regular');
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue('1');
  expect(await getInitialQaRole()).toBeNull();
});
