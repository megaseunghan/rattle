/** @jest-environment node */
import { createEvidenceSignHandler } from '../../supabase/functions/evidence-sign/handler';

const readyProof = jest.fn();
const sign = jest.fn();
const invoke = createEvidenceSignHandler({ readyProof, sign });
const req = { method: 'POST', headers: { get: () => 'Bearer user' },
  json: async () => ({ id: 'file', thumbnail: false, expiresIn: 86400, path: 'ignored' }) } as unknown as Request;
beforeEach(() => { jest.clearAllMocks(); });

test('발급 시간과 객체 경로는 서버에서 정한다', async () => {
  readyProof.mockResolvedValue({ id: 'file', store_id: 'shop', mime_type: 'application/pdf' });
  sign.mockResolvedValue('signed');
  expect((await invoke(req)).status).toBe(200);
  expect(readyProof).toHaveBeenCalledWith('Bearer user','file');
  expect(sign).toHaveBeenCalledWith('shop/file/document.pdf',300);
});
test('읽을 수 없는 증빙에는 링크를 발급하지 않는다', async () => {
  readyProof.mockResolvedValue(null);
  expect((await invoke(req)).status).toBe(403);
  expect(sign).not.toHaveBeenCalled();
});
