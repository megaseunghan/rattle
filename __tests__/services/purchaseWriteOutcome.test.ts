import { createPurchaseWithItems, updatePurchaseAmounts, PurchaseWriteError } from '../../lib/services/purchases';
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

it('건 카테고리와 정수 원 금액을 새 RPC에 보내고 매입 UUID를 반환한다', async () => {
  mockRpc.mockResolvedValue({ data: 'purchase-id', error: null });
  const items = [{ ingredient_id: null, name: '가상 장갑', quantity: 3, unit: '개', amount: 1000 }];
  const result = await createPurchaseWithItems({ ...input, items, category: '소모품', returnId: true });
  expect(mockRpc).toHaveBeenCalledWith('create_purchase_with_amounts', {
    p_store_id: 'store', p_supplier: '거래처', p_date: input.date, p_type: '수기', p_category: '소모품', p_items: items,
  });
  expect(result).toEqual({ purchaseId: 'purchase-id', refreshFailed: false });
});

it('금액별 매입을 단일 RPC로 저장하고 증빙을 연결할 번호를 받는다', async () => {
  const rows = [{ category: '비품', amount: 2300 }, { category: '식자재', amount: 1100 }];
  mockRpc.mockResolvedValue({ data: 'purchase-id', error: null });
  await expect(createPurchaseWithItems({ ...input, mode: 'amounts', rows, returnId: true })).resolves.toMatchObject({ purchaseId: 'purchase-id' });
  expect(mockRpc).toHaveBeenCalledWith('create_purchase_entry', {
    p_store_id: 'store', p_date: input.date, p_supplier: input.supplier, p_type: '수기', p_mode: 'amounts', p_rows: rows,
  });
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

it('금액별 수정은 원래 매입 ID로 요청하며 ID가 없으면 등록으로 전환하지 않는다', async () => {
  const rows = [{ category: '소모품', amount: 299 }];
  mockRpc.mockResolvedValue({ data: 'purchase-id', error: null });
  await expect(updatePurchaseAmounts({ ...input, edit_version: 1, id: '' }, rows)).rejects.toThrow('수정할 매입');
  expect(mockRpc).not.toHaveBeenCalled();
  await expect(updatePurchaseAmounts({ ...input, edit_version: 1, id: 'purchase-id' }, rows)).resolves.toEqual({ purchaseId: 'purchase-id', refreshFailed: false });
  expect(mockRpc).toHaveBeenCalledWith('create_purchase_entry', {
    p_store_id: input.store_id, p_date: input.date, p_supplier: input.supplier, p_type: input.type,
    p_mode: 'amounts', p_rows: rows, p_purchase_id: 'purchase-id', p_expected_version: 1,
  });
});

it('금액별 충돌은 화면에서 재조회할 수 있게 구분하고 재시도하지 않는다', async () => {
  mockRpc.mockResolvedValue({ error: { code: 'P0001', message: 'PURCHASE_CHANGED' } });
  await expect(updatePurchaseAmounts({ ...input, id: 'p', edit_version: 4 }, [{category: '비품', amount: 100}]))
    .rejects.toThrow('PURCHASE_CHANGED');
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(invalidateCachedStore).not.toHaveBeenCalled();
});
