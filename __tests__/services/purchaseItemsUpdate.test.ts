const mockRpc = jest.fn();
const mockSingle = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: () => ({ select: () => ({ eq: () => ({ single: () => mockSingle() }) }) }),
  },
}));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/services/evidence', () => ({ discardParentEvidence: jest.fn() }));
import { updatePurchaseItems } from '../../lib/services/purchases';

beforeEach(() => { mockRpc.mockReset().mockResolvedValue({ error: null }); mockSingle.mockReset(); });

test('첫 품목은 화면이 읽은 버전으로, 다음 품목은 방금 저장 뒤 버전으로 보낸다', async () => {
  mockSingle.mockResolvedValueOnce({ data: { id: 'p', edit_version: 8, purchase_amount_lines: [] }, error: null });
  await updatePurchaseItems('p', [{ itemId: 'a', quantity: 2, amount: null }, { itemId: 'b', quantity: 1, amount: 500 }], 7);
  expect(mockRpc).toHaveBeenNthCalledWith(1, 'update_purchase_item_amount', { p_item_id: 'a', p_quantity: 2, p_amount: null, p_expected_version: 7 });
  expect(mockRpc).toHaveBeenNthCalledWith(2, 'update_purchase_item_amount', { p_item_id: 'b', p_quantity: 1, p_amount: 500, p_expected_version: 8 });
});

test('먼저 고쳐졌으면 거기서 멈추고 PURCHASE_CHANGED를 알린다', async () => {
  mockRpc.mockResolvedValueOnce({ error: { message: 'PURCHASE_CHANGED' } });
  await expect(updatePurchaseItems('p', [{ itemId: 'a', quantity: 2, amount: null }, { itemId: 'b', quantity: 1, amount: null }], 7)).rejects.toThrow('PURCHASE_CHANGED');
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockSingle).not.toHaveBeenCalled();
});
