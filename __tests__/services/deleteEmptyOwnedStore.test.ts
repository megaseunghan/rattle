/** @jest-environment node */
import { deleteEmptyOwnedStore } from '../../lib/services/stores';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

const rpc = supabase.rpc as jest.Mock;

beforeEach(() => jest.resetAllMocks());

it('지정한 매장만 서버 삭제 함수에 전달한다', async () => {
  rpc.mockResolvedValue({ error: null });
  await expect(deleteEmptyOwnedStore('store-id')).resolves.toBeUndefined();
  expect(rpc).toHaveBeenCalledWith('delete_empty_owned_store', { p_store_id: 'store-id' });
});

it('운영 자료가 있으면 삭제 불가 사유를 안내한다', async () => {
  rpc.mockResolvedValue({ error: { message: 'STORE_DELETE_HAS_DATA' } });
  await expect(deleteEmptyOwnedStore('store-id')).rejects.toThrow('매장에 기록이 있어 삭제할 수 없어요');
});
