import { createPurchaseWithItems, PurchaseWriteError } from '../../lib/services/purchases';
import { invalidateCachedStore } from '../../lib/services/cacheInvalidation';
const mockRpc = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn() }));
const input = { store_id: 'store', date: '2026-10-01', supplier: '거래처', type: '수기', items: [] };
beforeEach(() => { mockRpc.mockReset(); jest.mocked(invalidateCachedStore).mockReset().mockResolvedValue(undefined); });
it('등록 성공 뒤 조회 갱신 실패는 저장 실패로 보고하지 않는다', async () => {
  mockRpc.mockResolvedValue({ error: null });
  jest.mocked(invalidateCachedStore).mockRejectedValue(new Error('refresh failed'));
  await expect(createPurchaseWithItems(input)).resolves.toEqual({ refreshFailed: true });
  expect(mockRpc).toHaveBeenCalledTimes(1);
});
it.each([
  [{ code: 'P0001', message: 'PURCHASE_INVALID_ITEMS' }, 'rejected'],
  [{ code: '23503', message: 'constraint' }, 'rejected'],
  [{ code: '', message: 'Failed to fetch' }, 'unknown'],
  [{ code: '08006', message: 'connection lost' }, 'unknown'],
])('서버 거절과 응답 미확인을 구분한다: %s', async (error, outcome) => {
  mockRpc.mockResolvedValue({ error });
  await expect(createPurchaseWithItems(input)).rejects.toMatchObject({ outcome });
  expect(invalidateCachedStore).not.toHaveBeenCalled();
  expect(mockRpc).toHaveBeenCalledTimes(1);
});
it('네트워크 예외는 자동 재시도하지 않고 결과 미확인으로 보존한다', async () => {
  mockRpc.mockRejectedValue(new TypeError('network lost'));
  await expect(createPurchaseWithItems(input)).rejects.toBeInstanceOf(PurchaseWriteError);
  expect(mockRpc).toHaveBeenCalledTimes(1);
});
