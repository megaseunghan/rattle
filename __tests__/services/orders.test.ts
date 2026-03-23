import { supabase } from '../../lib/supabase';
import {
  createOrderWithItems,
  updateOrderStatus,
  deliverOrder,
  deleteOrder,
} from '../../lib/services/orders';

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('orders 서비스', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createOrderWithItems', () => {
    it('RPC를 호출하고 order_id를 반환한다', async () => {
      (mockSupabase.rpc as jest.Mock).mockResolvedValue({ data: 'order-abc', error: null });

      const result = await createOrderWithItems('store-1', '농협', '2026-03-23', [
        { ingredient_id: 'ing-1', quantity: 10, unit: 'kg', unit_price: 5000 },
      ]);

      expect(mockSupabase.rpc).toHaveBeenCalledWith('create_order_with_items', {
        p_store_id: 'store-1',
        p_supplier_name: '농협',
        p_order_date: '2026-03-23',
        p_items: [{ ingredient_id: 'ing-1', quantity: 10, unit: 'kg', unit_price: 5000 }],
      });
      expect(result).toBe('order-abc');
    });

    it('에러 발생 시 예외를 던진다', async () => {
      (mockSupabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: { message: 'RPC 실패' } });

      await expect(
        createOrderWithItems('store-1', '농협', '2026-03-23', [])
      ).rejects.toThrow('RPC 실패');
    });
  });

  describe('updateOrderStatus', () => {
    it('발주 상태를 업데이트하고 반환한다', async () => {
      const updated = { id: 'order-1', status: 'confirmed' };
      const builder = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: updated, error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(builder);

      const result = await updateOrderStatus('order-1', 'confirmed');

      expect(result).toEqual(updated);
    });
  });

  describe('deliverOrder', () => {
    it('RPC deliver_order를 호출한다', async () => {
      (mockSupabase.rpc as jest.Mock).mockResolvedValue({ error: null });

      await expect(deliverOrder('order-1')).resolves.not.toThrow();
      expect(mockSupabase.rpc).toHaveBeenCalledWith('deliver_order', { p_order_id: 'order-1' });
    });

    it('에러 발생 시 예외를 던진다', async () => {
      (mockSupabase.rpc as jest.Mock).mockResolvedValue({ error: { message: '입고 처리 실패' } });

      await expect(deliverOrder('order-1')).rejects.toThrow('입고 처리 실패');
    });
  });

  describe('deleteOrder', () => {
    it('에러 없이 발주를 삭제한다', async () => {
      const builder = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(builder);

      await expect(deleteOrder('order-1')).resolves.not.toThrow();
    });
  });
});
