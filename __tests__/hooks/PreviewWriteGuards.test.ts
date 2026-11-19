import { createElement, ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { queryClient } from '../../lib/query/client';
import { usePurchases } from '../../lib/hooks/usePurchases';
import { useExpenses } from '../../lib/hooks/useExpenses';
import { useManualSales } from '../../lib/hooks/useManualSales';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useRecipes } from '../../lib/hooks/useRecipes';
import { useCleaningChecklist } from '../../lib/hooks/useCleaningChecklist';
import { useSchedule } from '../../lib/hooks/useSchedule';
import { useCategoryTaxonomy } from '../../lib/hooks/useCategoryTaxonomy';
import { usePreviewWriteGuard } from '../../lib/hooks/usePreviewWriteGuard';
let mockMode = 'regular';
const mockWrite = jest.fn();
jest.mock('../../lib/contexts/AuthContext', () => ({ useAuth: () => ({
  store: { id: 's' }, user: { id: 'owner' }, devPreviewMode: mockMode, currentRole: 'member',
}) }));
jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/services/purchases', () => ({ getPurchasesByMonth: async () => [], createPurchase: (...a: unknown[]) => mockWrite(...a), createPurchaseWithItems: (...a: unknown[]) => mockWrite(...a), deletePurchase: (...a: unknown[]) => mockWrite(...a) }));
jest.mock('../../lib/services/expenses', () => ({ getExpensesByMonth: async () => [], getEffectiveFixedExpenses: async () => [], getLegacyEffectiveFixedExpenses: async () => [], createExpense: (...a: unknown[]) => mockWrite(...a), updateExpense: (...a: unknown[]) => mockWrite(...a), deleteExpense: (...a: unknown[]) => mockWrite(...a), copyFixedExpensesWithDates: (...a: unknown[]) => mockWrite(...a) }));
jest.mock('../../lib/services/manualSales', () => ({ getManualSalesByMonth: async () => [], deleteManualSale: (...a: unknown[]) => mockWrite(...a) }));
jest.mock('../../lib/services/ingredients', () => ({ getIngredients: async () => [], createIngredient: (...a: unknown[]) => mockWrite(...a), updateIngredient: (...a: unknown[]) => mockWrite(...a), deleteIngredient: (...a: unknown[]) => mockWrite(...a), bulkCreateIngredients: (...a: unknown[]) => mockWrite(...a), updateIngredientCategories: (...a: unknown[]) => mockWrite(...a) }));
jest.mock('../../lib/services/recipes', () => ({ getRecipes: async () => [], createRecipeWithIngredients: (...a: unknown[]) => mockWrite(...a), deleteRecipe: (...a: unknown[]) => mockWrite(...a), updateRecipeCategories: (...a: unknown[]) => mockWrite(...a) }));
jest.mock('../../lib/services/cleaning', () => ({ listCleaningItems: async () => [], listCleaningLogsByDate: async () => [], addCleaningItem: (...a: unknown[]) => mockWrite(...a), checkCleaningItem: (...a: unknown[]) => mockWrite(...a), uncheckCleaningItem: (...a: unknown[]) => mockWrite(...a), updateCleaningItem: (...a: unknown[]) => mockWrite(...a), removeCleaningItem: (...a: unknown[]) => mockWrite(...a), reorderCleaningItems: (...a: unknown[]) => mockWrite(...a) }));
jest.mock('../../lib/services/schedule', () => ({ getEmployeeSchedule: async () => [], getMyPendingScheduleRequest: async () => null, submitScheduleRequest: (...a: unknown[]) => mockWrite(...a) }));
const taxonomy = { getCategories: async () => [], addCategory: mockWrite, renameCategory: mockWrite, removeCategory: mockWrite, countByCategory: async () => 0 };
function useCrud() {
  return { purchases: usePurchases('2026-11'), expenses: useExpenses('2026-11'), sales: useManualSales('2026-11'),
    ingredients: useIngredients(), recipes: useRecipes(), cleaning: useCleaningChecklist(),
    schedule: useSchedule('employee'), taxonomy: useCategoryTaxonomy(taxonomy) };
}
const wrapper = ({children}: {children: ReactNode}) => createElement(QueryClientProvider, {client: queryClient}, children);
type Crud = ReturnType<typeof useCrud>;
const cases: [string, (c: Crud) => Promise<unknown>][] = [
  ['매입 등록', c => c.purchases.add({} as any)], ['품목 매입 등록', c => c.purchases.addWithItems({} as any)], ['매입 삭제', c => c.purchases.remove('id')],
  ['비용 등록', c => c.expenses.add({} as any)], ['비용 수정', c => c.expenses.update('id', {} as any)], ['비용 삭제', c => c.expenses.remove('id')], ['고정비 복사', c => c.expenses.copyCarriedFixedExpenses([])],
  ['수기매출 삭제', c => c.sales.remove('id')],
  ['재고 등록', c => c.ingredients.create({} as any)], ['재고 수정', c => c.ingredients.update('id', {})], ['재고 삭제', c => c.ingredients.remove('id')], ['재고 일괄 등록', c => c.ingredients.bulkCreate([])], ['재고 분류 변경', c => c.ingredients.bulkUpdateCategory([], '분류')],
  ['레시피 등록', c => c.recipes.create('이름', '분류', 100, [])], ['레시피 삭제', c => c.recipes.remove('id')], ['레시피 분류 변경', c => c.recipes.bulkUpdateCategory([], '분류')],
  ['청소 체크', c => c.cleaning.toggle({ id: 'id' } as any, '이름')], ['청소 항목 등록', c => c.cleaning.addItem('open' as any, '이름')], ['청소 항목 수정', c => c.cleaning.editItem('id', '이름')], ['청소 항목 삭제', c => c.cleaning.removeItem('id')], ['청소 순서 변경', c => c.cleaning.reorder([])],
  ['스케줄 제출', c => c.schedule.submit([])], ['분류 등록', c => c.taxonomy.add('이름')], ['분류 수정', c => c.taxonomy.rename('이름', '새 이름')], ['분류 삭제', c => c.taxonomy.remove('이름')],
];
beforeEach(() => { mockWrite.mockClear(); mockMode = 'regular'; queryClient.clear(); });
afterEach(async () => { await act(async () => { await queryClient.cancelQueries(); queryClient.clear(); }); });
describe.each(['regular', 'part_time'])('%s 미리보기', mode => {
  it.each(cases)('%s은 실제 쓰기 서비스를 호출하지 않는다', async (_name, change) => {
    mockMode = mode;
    const { result } = renderHook(useCrud, {wrapper});
    await act(async () => { await expect(change(result.current)).rejects.toThrow(); });
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
it('이전 본인 화면 콜백도 현재 미리보기 상태로 차단하고 종료하면 복원한다', () => {
  mockMode = 'self'; const { result, rerender } = renderHook(usePreviewWriteGuard);
  const saved = result.current.assertCanWrite;
  expect(saved).not.toThrow();
  mockMode = 'regular'; rerender({}); expect(saved).toThrow();
  mockMode = 'self'; rerender({}); expect(saved).not.toThrow();
});

it('화면을 떠난 뒤 이전 확인 콜백으로도 쓰지 않는다', () => {
 mockMode='self';const {result,unmount}=renderHook(usePreviewWriteGuard);
 const saved=result.current.assertCanWrite;unmount();expect(saved).toThrow();
});
