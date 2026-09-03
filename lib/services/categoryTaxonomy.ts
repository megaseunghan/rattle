import { supabase } from '../supabase';

/** 매장별로 관리하는 카테고리 목록 하나를 다루는 CRUD 세트. stores.<column>(TEXT[])에 저장한다. */
export interface CategoryTaxonomy {
  getCategories(storeId: string): Promise<string[]>;
  saveCategories(storeId: string, categories: string[]): Promise<void>;
  renameCategory(storeId: string, oldName: string, newName: string, currentCategories: string[]): Promise<void>;
  removeCategory(storeId: string, name: string, currentCategories: string[]): Promise<void>;
  countByCategory(storeId: string, category: string): Promise<number>;
}

interface LinkedTable {
  table: string;
  column: string;
  fallback: string; // 카테고리 삭제 시 연결된 레코드가 이동할 값
}

export function createCategoryTaxonomy(
  storesColumn: string,
  defaultCategories: string[],
  linked?: LinkedTable,
): CategoryTaxonomy {
  async function getCategories(storeId: string): Promise<string[]> {
    const { data } = await supabase
      .from('stores')
      .select(storesColumn)
      .eq('id', storeId)
      .single();

    return ((data as any)?.[storesColumn] as string[] | null) ?? defaultCategories;
  }

  async function saveCategories(storeId: string, categories: string[]): Promise<void> {
    const { error } = await supabase
      .from('stores')
      .update({ [storesColumn]: categories })
      .eq('id', storeId);

    if (error) throw new Error(error.message);
  }

  async function renameCategory(
    storeId: string,
    oldName: string,
    newName: string,
    currentCategories: string[],
  ): Promise<void> {
    const updated = currentCategories.map(c => (c === oldName ? newName : c));
    await saveCategories(storeId, updated);

    if (linked) {
      const { error } = await supabase
        .from(linked.table)
        .update({ [linked.column]: newName })
        .eq('store_id', storeId)
        .eq(linked.column, oldName);
      if (error) throw new Error(error.message);
    }
  }

  async function removeCategory(storeId: string, name: string, currentCategories: string[]): Promise<void> {
    const updated = currentCategories.filter(c => c !== name);
    await saveCategories(storeId, updated);

    if (linked) {
      await supabase
        .from(linked.table)
        .update({ [linked.column]: linked.fallback })
        .eq('store_id', storeId)
        .eq(linked.column, name);
    }
  }

  async function countByCategory(storeId: string, category: string): Promise<number> {
    if (!linked) return 0;
    const { count } = await supabase
      .from(linked.table)
      .select('id', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq(linked.column, category);
    return count ?? 0;
  }

  return { getCategories, saveCategories, renameCategory, removeCategory, countByCategory };
}
