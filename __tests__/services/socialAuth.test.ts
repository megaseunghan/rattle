import { Platform } from 'react-native';
import * as Apple from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../lib/supabase';
import { completeAuthCallback } from '../../lib/services/authCallback';
import { signInWithSocialProvider } from '../../lib/services/socialAuth';

jest.mock('../../lib/supabase', () => ({ supabase: { auth: { signInWithOAuth: jest.fn(), signInWithIdToken: jest.fn(), updateUser: jest.fn() } } }));
jest.mock('../../lib/services/authCallback', () => ({ completeAuthCallback: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: () => 'rattle:///' }));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(), digestStringAsync: jest.fn(), CryptoDigestAlgorithm: { SHA256: 'SHA-256' } }));
jest.mock('expo-apple-authentication', () => ({ isAvailableAsync: jest.fn(), signInAsync: jest.fn(), AppleAuthenticationScope: { EMAIL: 0, FULL_NAME: 1 } }));
const originalOS = Platform.OS;
beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(Platform, 'OS', { value: 'ios', configurable: true });
  (Apple.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (Crypto.randomUUID as jest.Mock).mockReturnValueOnce('raw-nonce').mockReturnValueOnce('state');
  (Crypto.digestStringAsync as jest.Mock).mockResolvedValue('hashed-nonce');
  (Apple.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 'apple-id-token', state: 'state', fullName: null });
  (supabase.auth.signInWithIdToken as jest.Mock).mockResolvedValue({ error: null });
  (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: null });
  (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValue({ data: { url: 'https://auth.example/authorize' }, error: null });
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: 'rattle:///?code=one' });
  (completeAuthCallback as jest.Mock).mockResolvedValue(true);
});
afterAll(() => Object.defineProperty(Platform, 'OS', { value: originalOS, configurable: true }));
it.each(['google', 'kakao'] as const)('%s도 기존 검증된 콜백으로 세션을 생성한다', async provider => {
  expect(await signInWithSocialProvider(provider)).toBe(true);
  expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider, options: expect.objectContaining({ redirectTo: 'rattle:///', skipBrowserRedirect: true }) }));
  expect(completeAuthCallback).toHaveBeenCalledWith('rattle:///?code=one', 'rattle:///');
});
it('브라우저 취소는 로그인 오류로 처리하지 않는다', async () => {
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'cancel' });
  expect(await signInWithSocialProvider('google')).toBe(false);
  expect(completeAuthCallback).not.toHaveBeenCalled();
});
it('URL 누락이나 유효하지 않은 콜백을 성공으로 처리하지 않는다', async () => {
  (supabase.auth.signInWithOAuth as jest.Mock).mockResolvedValueOnce({ data: {}, error: null });
  await expect(signInWithSocialProvider('google')).rejects.toThrow();
  (completeAuthCallback as jest.Mock).mockResolvedValue(false);
  await expect(signInWithSocialProvider('google')).rejects.toThrow();
});
it('Apple에는 해시 nonce를 보내고 Supabase에는 원문 nonce를 전달한다', async () => {
  expect(await signInWithSocialProvider('apple')).toBe(true);
  expect(Apple.signInAsync).toHaveBeenCalledWith(expect.objectContaining({ nonce: 'hashed-nonce', state: 'state' }));
  expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({ provider: 'apple', token: 'apple-id-token', nonce: 'raw-nonce' });
  expect(supabase.auth.updateUser).not.toHaveBeenCalled();
});
it('Apple 이름은 값이 제공된 최초 승인 때만 저장한다', async () => {
  (Apple.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 'apple-id-token', state: 'state', fullName: { givenName: '승한', familyName: '김' } });
  await signInWithSocialProvider('apple');
  expect(supabase.auth.updateUser).toHaveBeenCalledWith({ data: { full_name: '승한 김' } });
});
it('Apple 취소와 잘못된 state를 구분한다', async () => {
  (Apple.signInAsync as jest.Mock).mockRejectedValueOnce({ code: 'ERR_REQUEST_CANCELED' });
  expect(await signInWithSocialProvider('apple')).toBe(false);
  (Crypto.randomUUID as jest.Mock).mockReturnValue('state-again');
  (Apple.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 'token', state: 'wrong-state' });
  await expect(signInWithSocialProvider('apple')).rejects.toThrow();
  expect(supabase.auth.signInWithIdToken).not.toHaveBeenCalled();
});
it.each(['android', 'web'] as const)('%s에서는 Apple 브라우저 OAuth를 사용한다', async platform => {
  Object.defineProperty(Platform, 'OS', { value: platform, configurable: true });
  expect(await signInWithSocialProvider('apple')).toBe(true);
  expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'apple' }));
  expect(Apple.isAvailableAsync).not.toHaveBeenCalled();
});
