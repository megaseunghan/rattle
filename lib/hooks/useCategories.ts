import { useCategoryTaxonomy } from './useCategoryTaxonomy';
import { ingredientCategoryTaxonomy } from '../services/categories';

export function useCategories() {
  return useCategoryTaxonomy(ingredientCategoryTaxonomy);
}
