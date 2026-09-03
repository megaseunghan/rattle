import { createCategoryTaxonomy } from './categoryTaxonomy';

/** 매입 카테고리 — stores.purchase_categories, purchases.category와 연동 */
export const purchaseCategoryTaxonomy = createCategoryTaxonomy(
  'purchase_categories',
  ['식자재', '비품소모품', '주류', '기타'],
  { table: 'purchases', column: 'category', fallback: '기타' },
);
