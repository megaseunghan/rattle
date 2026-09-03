import { useCategoryTaxonomy } from './useCategoryTaxonomy';
import { purchaseCategoryTaxonomy } from '../services/purchaseCategories';

export function usePurchaseCategories() {
  return useCategoryTaxonomy(purchaseCategoryTaxonomy);
}
