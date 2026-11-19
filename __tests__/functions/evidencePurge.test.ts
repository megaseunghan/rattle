/** @jest-environment node */
import { createEvidencePurgeHandler } from '../../supabase/functions/evidence-purge/handler';
const claim = jest.fn();
const remove = jest.fn();
const handle = createEvidencePurgeHandler({ token: 'test', claim, remove });
const request = (token: string) => new Request('https://local/purge', { method: 'POST',
  headers: { 'x-evidence-purge-token': token }, body: JSON.stringify({paths:['active/file']}) });
beforeEach(() => { jest.resetAllMocks(); });
it('거부된 요청은 정리를 시작할 수 없다', async () => {
  expect((await handle(request('wrong'))).status).toBe(401);
  expect(claim).not.toHaveBeenCalled();
});
it('DB가 선별한 만료 경로만 처리하고 Storage 실패를 보고한다', async () => {
  claim.mockResolvedValue(['expired/file']);
  remove.mockRejectedValue(Error('offline'));
  expect((await handle(request('test'))).status).toBe(503);
  expect(remove).toHaveBeenCalledWith(['expired/file']);
});
