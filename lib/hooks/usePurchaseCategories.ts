import { useCategoryTaxonomy, type CategoryTaxonomyOptions } from './useCategoryTaxonomy';
import { purchaseCategoryTaxonomy } from '../services/purchaseCategories';

export function usePurchaseCategories(options?: CategoryTaxonomyOptions) {
  return useCategoryTaxonomy(purchaseCategoryTaxonomy, options);
}
