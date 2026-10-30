/** @jest-environment node */
import { deleteAccount } from '../../lib/services/account';
import { supabase } from '../../lib/supabase';
import { requestAppleCredential } from '../../lib/services/socialAuth';
jest.mock('../../lib/services/socialAuth', () => ({ requestAppleCredential: jest.fn() }));
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { getUser: jest.fn() }, functions: { invoke: jest.fn() } } }));
beforeEach(() => {
  jest.resetAllMocks();
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { identities: [] } }, error: null });
});
it('소유 매장이 남아 있으면 삭제 또는 소유권 이전을 안내한다', async () => {
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({ error: { context: Response.json({ code: 'ACCOUNT_OWNS_STORES' }, { status: 409 }) } });
  await expect(deleteAccount()).rejects.toThrow('매장 정보에서 빈 매장을 삭제하거나, 멤버 관리에서 소유권을 이전');
});
it('서버 원문은 화면에 전달하지 않는다', async () => {
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({ error: { context: Response.json({ error: 'private database detail' }, { status: 500 }) } });
  await expect(deleteAccount()).rejects.toThrow('탈퇴하지 못했어요');
});
it('외부 연결 해제 재처리 중에도 계정 삭제 성공을 처리한다', async () => {
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { success: true, cleanupPending: true }, error: null });
  await expect(deleteAccount()).resolves.toBeUndefined();
});
it('Apple 계정 탈퇴는 현재 세션을 바꾸지 않고 인증 코드만 서버로 전달한다', async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { identities: [{ provider: 'apple', identity_data: { sub: 'apple-user' } }] } }, error: null });
  (requestAppleCredential as jest.Mock).mockResolvedValue({ credential: { user: 'apple-user', authorizationCode: 'fresh-code' } });
  (supabase.functions.invoke as jest.Mock).mockResolvedValue({ data: { success: true }, error: null });
  await deleteAccount();
  expect(supabase.functions.invoke).toHaveBeenCalledWith('delete-account', { body: { appleAuthorizationCode: 'fresh-code' } });
});
it('다른 Apple 계정이나 인증 취소로 탈퇴 요청을 보내지 않는다', async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { identities: [{ provider: 'apple', identity_data: { sub: 'apple-user' } }] } }, error: null });
  (requestAppleCredential as jest.Mock).mockResolvedValue({ credential: { user: 'someone-else', authorizationCode: 'code' } });
  await expect(deleteAccount()).rejects.toThrow('가입할 때 사용한 Apple 계정');
  expect(supabase.functions.invoke).not.toHaveBeenCalled();
  (requestAppleCredential as jest.Mock).mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
  await expect(deleteAccount()).rejects.toEqual({ code: 'ERR_REQUEST_CANCELED' });
  expect(supabase.functions.invoke).not.toHaveBeenCalled();
});
