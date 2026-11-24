import { useCategoryTaxonomy } from './useCategoryTaxonomy';
import { purchaseCategoryTaxonomy } from '../services/purchaseCategories';

export function usePurchaseCategories({ active = true }: { active?: boolean } = {}) {
  return useCategoryTaxonomy(purchaseCategoryTaxonomy, { active, cacheName: 'purchase-categories' });
}
