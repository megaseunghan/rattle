import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabase';
import { UserFacingError } from '../utils/error';

export type QaRole = 'admin' | 'regular' | 'part_time';
const endpoint = 'http://127.0.0.1:18765';

// Explicit build opt-in plus native simulator check. No account credentials ship in the bundle.
export function isQaLoginEnabled(): boolean {
  return process.env.EXPO_PUBLIC_QA_LOGIN === '1' && Platform.OS === 'ios' && !Device.isDevice &&
    !!process.env.EXPO_PUBLIC_QA_BROKER_TOKEN;
}

export async function getInitialQaRole(): Promise<QaRole | null> {
  if (!isQaLoginEnabled() || await AsyncStorage.getItem('QA_AUTO_LOGIN_DONE')) return null;
  const roles: Record<string, QaRole> = { '900001': 'admin', '900002': 'regular', '900003': 'part_time' };
  return roles[Constants.platform?.ios?.buildNumber ?? ''] ?? null;
}

export async function signInForQa(role: QaRole): Promise<void> {
  if (!isQaLoginEnabled()) throw new UserFacingError('테스트 로그인은 전용 시뮬레이터에서만 사용할 수 있어요.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${endpoint}/session`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.EXPO_PUBLIC_QA_BROKER_TOKEN}` },
      body: JSON.stringify({ role }),
    });
    if (!response.ok) throw new UserFacingError('테스트 로그인 서버를 확인해주세요.');
    const data = await response.json();
    if (data.projectUrl !== process.env.EXPO_PUBLIC_SUPABASE_URL || !data.storeId ||
      !data.session?.access_token || !data.session?.refresh_token) throw new UserFacingError('테스트 환경이 일치하지 않아요.');
    // Select the fixture before the normal AuthContext session event loads stores.
    await AsyncStorage.setItem('LAST_STORE_ID', data.storeId);
    const { error } = await supabase.auth.setSession(data.session);
    if (error) throw error;
    await AsyncStorage.setItem('QA_AUTO_LOGIN_DONE', '1');
  } finally { clearTimeout(timer); }
}
