import { supabase } from '../../lib/supabase';
import {
  getRecipes,
  createRecipeWithIngredients,
  deleteRecipe,
} from '../../lib/services/recipes';

jest.mock('../../lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn() },
}));

const mockSupabase = supabase as jest.Mocked<typeof supabase>;

describe('recipes 서비스', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getRecipes', () => {
    it('store_id로 레시피 목록을 반환한다', async () => {
      const mockData = [
        { id: 'r1', store_id: 'store-1', name: '아메리카노', category: '음료', selling_price: 4000, cost: 800, margin_rate: 80, created_at: '', recipe_ingredients: [] },
      ];
      const builder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: mockData, error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(builder);

      const result = await getRecipes('store-1');

      expect(result).toEqual(mockData);
    });
  });

  describe('createRecipeWithIngredients', () => {
    it('RPC를 호출하고 recipe_id를 반환한다', async () => {
      (mockSupabase.rpc as jest.Mock).mockResolvedValue({ data: 'recipe-abc', error: null });

      const result = await createRecipeWithIngredients(
        'store-1', '아메리카노', '음료', 4000,
        [{ ingredient_id: 'ing-1', quantity: 18, unit: 'g' }]
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith('create_recipe_with_ingredients', {
        p_store_id: 'store-1',
        p_name: '아메리카노',
        p_category: '음료',
        p_selling_price: 4000,
        p_ingredients: [{ ingredient_id: 'ing-1', quantity: 18, unit: 'g' }],
      });
      expect(result).toBe('recipe-abc');
    });
  });

  describe('deleteRecipe', () => {
    it('에러 없이 레시피를 삭제한다', async () => {
      const builder = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null }),
      };
      (mockSupabase.from as jest.Mock).mockReturnValue(builder);

      await expect(deleteRecipe('r1')).resolves.not.toThrow();
    });
  });
});
