import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../supabase';
import { completeAuthCallback } from './authCallback';
import { UserFacingError } from '../utils/error';

export type SocialProvider = 'kakao' | 'google' | 'apple';

export function isAuthCancelled(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_REQUEST_CANCELED';
}

export async function isAppleLoginAvailable(): Promise<boolean> {
  return Platform.OS === 'ios' && await AppleAuthentication.isAvailableAsync();
}

/** 탈퇴 재인증에서는 Supabase 세션을 바꾸지 않고 Apple 인증 코드만 사용한다. */
export async function requestAppleCredential() {
  if (!await isAppleLoginAvailable()) {
    throw new UserFacingError('Apple 로그인을 사용한 iPhone에서 다시 시도해주세요.');
  }
  const nonce = Crypto.randomUUID();
  const state = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
    nonce: hashedNonce,
    state,
  });
  if (credential.state !== state || !credential.identityToken) {
    throw new UserFacingError('Apple 인증을 완료하지 못했어요. 다시 시도해주세요.');
  }
  return { credential, nonce };
}

/** false는 사용자가 인증 창을 닫은 경우다. 오류와 구분한다. */
export async function signInWithSocialProvider(provider: SocialProvider): Promise<boolean> {
  if (provider === 'apple' && Platform.OS === 'ios') {
    try {
      const { credential, nonce } = await requestAppleCredential();
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken!, nonce });
      if (error) throw error;
      // Apple 이름은 최초 승인 때만 제공한다. 나중 로그인에서 빈 값으로 덮어쓰지 않는다.
      const fullName = [credential.fullName?.givenName, credential.fullName?.middleName, credential.fullName?.familyName]
        .filter(Boolean).join(' ');
      if (fullName) {
        try {
          const { error: profileError } = await supabase.auth.updateUser({ data: { full_name: fullName } });
          if (profileError) console.warn('apple_profile_update_failed');
        } catch {
          // 로그인 세션은 이미 유효하다. 선택 정보 저장 실패로 로그인 실패를 표시하지 않는다.
          console.warn('apple_profile_update_failed');
        }
      }
      return true;
    } catch (error) {
      if (isAuthCancelled(error)) return false;
      throw error;
    }
  }
  const redirectUrl = Linking.createURL('/');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true,
      ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
    },
  });
  if (error) throw error;
  if (!data.url) throw new UserFacingError('로그인을 시작하지 못했어요. 다시 시도해주세요.');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
  if (result.type === 'cancel' || result.type === 'dismiss') return false;
  if (result.type !== 'success' || !await completeAuthCallback(result.url, redirectUrl)) {
    throw new UserFacingError('로그인을 완료하지 못했어요. 다시 시도해주세요.');
  }
  return true;
}
