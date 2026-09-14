import { createCategoryTaxonomy } from './categoryTaxonomy';

/** 재고(식자재) 카테고리 — stores.categories, ingredients.category와 연동 */
export const ingredientCategoryTaxonomy = createCategoryTaxonomy(
  'categories',
  ['식자재', '주류', '비품'],
  { table: 'ingredients', column: 'category', fallback: '기타' },
);
