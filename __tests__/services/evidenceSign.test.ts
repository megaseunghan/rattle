/** @jest-environment node */
import { createEvidenceSignHandler } from '../../supabase/functions/evidence-sign/handler';

import { signEvidence } from '../../lib/services/evidence';
import { EvidenceReuploadRequired } from '../../lib/utils/evidenceError';
import type { EvidenceFile } from '../../lib/types/evidence';
const mockInvoke = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => mockInvoke(...args) } } }));
const file: EvidenceFile = {
  id: 'file', store_id: 'shop', purchase_id: null, expense_id: 'expense', recurring_rule_id: null,
  occurrence_month: null, name: 'receipt.pdf', mime_type: 'application/pdf', status: 'ready', created_by: 'owner', created_at: '',
};
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

test('서버가 재첨부를 요구한 409만 재첨부 안내로 연결한다', async () => {
  readyProof.mockResolvedValue(file);
  sign.mockResolvedValue(null);
  const response = await invoke(req);
  expect(response.status).toBe(409);
  mockInvoke.mockResolvedValueOnce({ error: { context: response } });
  await expect(signEvidence(file)).rejects.toBeInstanceOf(EvidenceReuploadRequired);
  const other = { context: Response.json({ code: 'OTHER' }, { status: 409 }) };
  mockInvoke.mockResolvedValueOnce({ error: other });
  await expect(signEvidence(file)).rejects.toBe(other);
});
