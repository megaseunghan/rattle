import { supabase } from '../../lib/supabase';
import {
  getIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
} from '../../lib/services/ingredients';

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

function makeQueryBuilder(result: { data?: any; error?: any }) {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue(result),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue(result),
  };
  // delete().eq() → resolved
  builder.eq.mockImplementation(() => ({
    ...builder,
    then: (resolve: any) => Promise.resolve(result).then(resolve),
    catch: (reject: any) => Promise.resolve(result).catch(reject),
    [Symbol.toStringTag]: 'Promise',
  }));
  return builder;
}

describe('ingredients 서비스', () => {
  const STORE_ID = 'store-123';

  beforeEach(() => jest.clearAllMocks());

  describe('getIngredients', () => {
    it('store_id로 식자재 목록을 반환한다', async () => {
      const mockData = [
        { id: '1', name: '원두', store_id: STORE_ID, category: '음료재료', current_stock: 10, unit: 'kg', min_stock: 2, last_price: 30000, updated_at: '', created_at: '' },
      ];
      const builder = makeQueryBuilder({ data: mockData, error: null });
      (mockSupabase.from as jest.Mock).mockReturnValue(builder);

      const result = await getIngredients(STORE_ID);

      expect(mockSupabase.from).toHaveBeenCalledWith('ingredients');
      expect(result).toEqual(mockData);
    });

    it('에러 발생 시 예외를 던진다', async () => {
      const builder = makeQueryBuilder({ data: null, error: { message: 'DB 오류' } });
      (mockSupabase.from as jest.Mock).mockReturnValue(builder);

      await expect(getIngredients(STORE_ID)).rejects.toThrow('DB 오류');
    });
  });

  describe('createIngredient', () => {
    it('새 식자재를 생성하고 반환한다', async () => {
      const newIngredient = { id: '2', name: '우유', store_id: STORE_ID, category: '음료재료', current_stock: 5, unit: 'L', min_stock: 1, last_price: 2500, updated_at: '', created_at: '' };
      const builder = makeQueryBuilder({ data: newIngredient, error: null });
      (mockSupabase.from as jest.Mock).mockReturnValue(builder);

      const result = await createIngredient({
        store_id: STORE_ID,
        name: '우유',
        category: '음료재료',
        current_stock: 5,
        unit: 'L',
        min_stock: 1,
        last_price: 2500,
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('ingredients');
      expect(result).toEqual(newIngredient);
    });
  });

  describe('updateIngredient', () => {
    it('식자재를 업데이트하고 반환한다', async () => {
      const updated = { id: '1', name: '원두', current_stock: 8 };
      const builder = makeQueryBuilder({ data: updated, error: null });
      (mockSupabase.from as jest.Mock).mockReturnValue(builder);

      const result = await updateIngredient('1', { current_stock: 8 });

      expect(mockSupabase.from).toHaveBeenCalledWith('ingredients');
      expect(result).toEqual(updated);
    });
  });

  describe('deleteIngredient', () => {
    it('에러 없이 삭제를 완료한다', async () => {
      const builder = makeQueryBuilder({ error: null });
      (mockSupabase.from as jest.Mock).mockReturnValue(builder);

      await expect(deleteIngredient('1')).resolves.not.toThrow();
    });

    it('에러 발생 시 예외를 던진다', async () => {
      const builder = makeQueryBuilder({ error: { message: '삭제 실패' } });
      (mockSupabase.from as jest.Mock).mockReturnValue(builder);

      await expect(deleteIngredient('1')).rejects.toThrow('삭제 실패');
    });
  });
});
