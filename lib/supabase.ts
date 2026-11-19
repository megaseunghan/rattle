import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secureStorageAdapter } from './utils/secureStorageAdapter';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

type AppSupabaseClient = SupabaseClient;
let appClient: AppSupabaseClient | undefined;

/** 단순 import는 auth 저장소/토큰 갱신을 시작하지 않는다. 일반 앱의 첫 실제 사용 때만 생성한다. */
export function getAppSupabaseClient(): AppSupabaseClient {
  if (!appClient) appClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: secureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  return appClient;
}

/** 기존 서비스 API를 보존하는 지연 facade. SDK 메서드의 this는 실제 client에 고정한다. */
export const supabase = new Proxy({} as AppSupabaseClient, {
  get(_target, property) {
    const client = getAppSupabaseClient();
    const value = Reflect.get(client, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
