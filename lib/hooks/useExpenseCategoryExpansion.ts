import { useSyncExternalStore } from 'react';
import { getExpenseCategories, subscribeExpenseCategories, toggleExpenseCategory } from '../utils/expenseCategorySession';

export function useExpenseCategoryExpansion(userId?: string, storeId?: string) {
  const expanded = useSyncExternalStore(subscribeExpenseCategories, () => getExpenseCategories(userId, storeId), () => getExpenseCategories(userId, storeId));
  return { expanded, toggle: (category: string) => toggleExpenseCategory(userId, storeId, category) };
}
