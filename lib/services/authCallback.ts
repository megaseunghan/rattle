import { supabase } from '../supabase';

let lastUrl: string | null = null;
let lastResult: Promise<boolean> | null = null;

/** 브라우저 완료와 딥링크가 중복 도착해도 인증 코드를 한 번만 교환한다. */
export function completeAuthCallback(url: string, redirectUrl: string): Promise<boolean> {
  let callback: URL;
  try {
    callback = new URL(url);
    const expected = new URL(redirectUrl);
    if (callback.protocol !== expected.protocol || callback.host !== expected.host ||
        callback.pathname.replace(/\/$/, '') !== expected.pathname.replace(/\/$/, '')) {
      return Promise.resolve(false);
    }
  } catch { return Promise.resolve(false); }
  const fragment = new URLSearchParams(callback.hash.slice(1));
  const code = callback.searchParams.get('code');
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');
  const error = callback.searchParams.get('error_description') ?? fragment.get('error_description') ??
    callback.searchParams.get('error') ?? fragment.get('error');
  if (error) return Promise.reject(new Error('로그인 인증이 완료되지 않았습니다. 다시 시도해주세요.'));
  if (!code && !(accessToken && refreshToken)) return Promise.resolve(false);
  if (lastUrl === url && lastResult) return lastResult;
  lastUrl = url;
  lastResult = (async () => {
    const result = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.setSession({ access_token: accessToken!, refresh_token: refreshToken! });
    if (result.error) throw result.error;
    return true;
  })();
  const pending = lastResult;
  pending.catch(() => {
    if (lastResult === pending) { lastUrl = null; lastResult = null; }
  });
  return pending;
}
