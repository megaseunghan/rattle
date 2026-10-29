import { updateIngredientCategories } from '../../lib/services/ingredients';
import { updateRecipeCategories } from '../../lib/services/recipes';
const mockFrom = jest.fn();
const mockInvalidate = jest.fn();
jest.mock('../../lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => mockFrom(...args) } }));
jest.mock('../../lib/services/cacheInvalidation', () => ({ invalidateCachedStore: (...args: unknown[]) => mockInvalidate(...args) }));
jest.mock('../../lib/services/notifications', () => ({ notifyIfEnabled: jest.fn() }));
beforeEach(() => { jest.clearAllMocks(); });
for (const [table, update] of [['ingredients',updateIngredientCategories], ['recipes',updateRecipeCategories]] as const) {
  it(`${table}: one scoped update and invalidation for multiple selected IDs`, async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const inIds = jest.fn().mockReturnValue({ eq });
    const mutation = jest.fn().mockReturnValue({ in: inIds });
    mockFrom.mockReturnValue({ update: mutation });
    await update('store-a',['one','two','one'],'new');
    expect(mockFrom).toHaveBeenCalledTimes(1); expect(mockFrom).toHaveBeenCalledWith(table);
    expect(inIds).toHaveBeenCalledWith('id',['one','two']); expect(eq).toHaveBeenCalledWith('store_id','store-a');
    expect(mockInvalidate).toHaveBeenCalledTimes(1); expect(mockInvalidate).toHaveBeenCalledWith('store-a');
  });
  it(`${table}: failures propagate and empty selections do no work`, async () => {
    await update('a',[],'new'); expect(mockFrom).not.toHaveBeenCalled();
    mockFrom.mockReturnValue({ update: () => ({ in: () => ({ eq: async () => ({ error: { message: 'failed' } }) }) }) });
    await expect(update('a',['one'],'new')).rejects.toThrow('failed'); expect(mockInvalidate).not.toHaveBeenCalled();
  });
}
