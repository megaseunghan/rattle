/** @jest-environment node */
import { createDeleteAccountHandler } from '../../supabase/functions/delete-account/handler';
const deps = { authorize: jest.fn(), assertDeletable: jest.fn(), revokeApple: jest.fn(), deleteAuthUser: jest.fn(), unlinkPending: jest.fn(), report: jest.fn() };
const handle = createDeleteAccountHandler(deps);
const request = (token = 'Bearer fixture') => new Request('https://local/delete-account', { method: 'POST', headers: token ? { Authorization: token } : {} });
beforeEach(() => { jest.resetAllMocks(); deps.authorize.mockResolvedValue('authenticated-user'); });
it('인증되지 않은 요청은 삭제하지 않는다', async () => {
  expect((await handle(request(''))).status).toBe(401);
  expect(deps.deleteAuthUser).not.toHaveBeenCalled();
});
it('계정 소유자는 Auth에서 검증한 ID만 사용한다', async () => {
  const response = await handle(request());
  expect(response.status).toBe(200);
  expect(deps.deleteAuthUser).toHaveBeenCalledWith('authenticated-user');
  expect(deps.deleteAuthUser.mock.invocationCallOrder[0]).toBeLessThan(deps.unlinkPending.mock.invocationCallOrder[0]);
});
it('소유 매장이 남으면 외부 연결이나 계정을 삭제하지 않는다', async () => {
  deps.assertDeletable.mockRejectedValue({ message: 'ACCOUNT_OWNS_STORES' });
  const response = await handle(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ code: 'ACCOUNT_OWNS_STORES' });
  expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  expect(deps.unlinkPending).not.toHaveBeenCalled();
  expect(deps.revokeApple).not.toHaveBeenCalled();
});
it('DB 보호 장치가 누락되거나 Auth 삭제가 실패하면 외부 연결을 유지한다', async () => {
  deps.deleteAuthUser.mockRejectedValue(new Error('internal DB details'));
  const response = await handle(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain('internal DB details');
  expect(deps.unlinkPending).not.toHaveBeenCalled();
});
it('외부 연결 해제 실패는 계정 삭제 성공과 재처리 대기를 구분한다', async () => {
  deps.unlinkPending.mockRejectedValue(new Error('provider unavailable'));
  const response = await handle(request());
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ success: true, cleanupPending: true });
  expect(deps.report).toHaveBeenCalledWith('account_unlink_pending');
});
it.each(['APPLE_REAUTH_REQUIRED', 'APPLE_ACCOUNT_MISMATCH', 'APPLE_UNLINK_FAILED'])('Apple 해제 실패 %s에서는 계정을 삭제하지 않는다', async code => {
  deps.revokeApple.mockRejectedValue({ code });
  const response = await handle(request());
  expect(response.status).toBe(code === 'APPLE_UNLINK_FAILED' ? 503 : 409);
  expect(await response.json()).toEqual({ code });
  expect(deps.deleteAuthUser).not.toHaveBeenCalled();
});
it('소유권 검사 후 Apple 해제, 계정 삭제 순서를 지킨다', async () => {
  await handle(new Request('https://local/delete-account', { method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify({ appleAuthorizationCode: 'fresh-code' }) }));
  expect(deps.revokeApple).toHaveBeenCalledWith('authenticated-user', 'fresh-code');
  expect(deps.assertDeletable.mock.invocationCallOrder[0]).toBeLessThan(deps.revokeApple.mock.invocationCallOrder[0]);
  expect(deps.revokeApple.mock.invocationCallOrder[0]).toBeLessThan(deps.deleteAuthUser.mock.invocationCallOrder[0]);
});
