const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
interface Dependencies {
  authorize: (header: string) => Promise<string | null>;
  assertDeletable: (header: string) => Promise<void>;
  revokeApple: (userId: string, authorizationCode?: string) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;
  unlinkPending: (userId: string) => Promise<void>;
  report: (code: string) => void;
}
export function createDeleteAccountHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
      status, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const header = req.headers.get('Authorization') ?? '';
    if (!/^Bearer\s+\S+$/i.test(header)) return json({ code: 'AUTH_REQUIRED' }, 401);
    let userId: string | null;
    try { userId = await deps.authorize(header); }
    catch { return json({ code: 'AUTH_REQUIRED' }, 401); }
    if (!userId) return json({ code: 'AUTH_REQUIRED' }, 401);
    try {
      await deps.assertDeletable(header);
      const body = await req.json().catch(() => ({}));
      const code = typeof body?.appleAuthorizationCode === 'string' ? body.appleAuthorizationCode : undefined;
      // Apple은 재인증 코드로 즉시 해제한다. 실패하면 계정 삭제를 진행하지 않는다.
      await deps.revokeApple(userId, code);
      // DB 트리거에서 소유권을 재검사하고 계정 삭제·카카오 재처리 기록을 함께 커밋한다.
      await deps.deleteAuthUser(userId);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error &&
          ['APPLE_REAUTH_REQUIRED', 'APPLE_ACCOUNT_MISMATCH', 'APPLE_UNLINK_FAILED'].includes(String(error.code))) {
        deps.report('apple_account_unlink_failed');
        return json({ code: error.code }, error.code === 'APPLE_UNLINK_FAILED' ? 503 : 409);
      }
      if (typeof error === 'object' && error !== null && 'message' in error && String(error.message).includes('ACCOUNT_OWNS_STORES')) {
        return json({ code: 'ACCOUNT_OWNS_STORES' }, 409);
      }
      deps.report('account_delete_failed');
      return json({ code: 'DELETE_FAILED' }, 500);
    }
    try { await deps.unlinkPending(userId); }
    catch {
      deps.report('account_unlink_pending');
      return json({ success: true, cleanupPending: true }, 202);
    }
    return json({ success: true }, 200);
  };
}
