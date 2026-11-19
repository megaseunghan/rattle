import { savePosOrders } from '../../lib/services/tossSync';
import { invalidateStoreData } from '../../lib/query/client';
import { supabase } from '../../lib/supabase';
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../../lib/query/client', () => ({ invalidateStoreData: jest.fn().mockResolvedValue(undefined) }));
beforeEach(() => { jest.clearAllMocks(); (supabase.rpc as jest.Mock).mockResolvedValue({ error: null }); });
it('POS 저장은 POS·손익만 무효화하고 부분 성공 뒤 실패에도 갱신한다', async () => {
 const orders = Array.from({ length: 501 }, (_, i) => ({ orderId: String(i) })) as any;
 (supabase.rpc as jest.Mock).mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: new Error('write failed') });
 await expect(savePosOrders('a', orders)).rejects.toThrow('write failed');
 expect(invalidateStoreData).toHaveBeenCalledWith('a', ['pos', 'financial']);
 expect(supabase.rpc).toHaveBeenCalledTimes(2);
});
it('빈 가져오기는 기존 무효화 계약대로 조회를 만들지 않는다', async () => {
 await savePosOrders('a', []);
 expect(invalidateStoreData).not.toHaveBeenCalled();
});
