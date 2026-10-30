import { supabase } from '../supabase';
import { invalidateCachedStore } from './cacheInvalidation';
import { StoreTaxonomy } from '../../types';

/** 매장별로 관리하는 카테고리 목록 하나를 다루는 CRUD 세트. stores.<column>(TEXT[])에 저장한다. */
export interface CategoryTaxonomy {
  getCategories(storeId: string): Promise<string[]>;
  addCategory(storeId: string, name: string): Promise<void>;
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
  const domain: StoreTaxonomy['domain'] = storesColumn === 'purchase_categories' ? 'purchase' : 'ingredient';
  async function getCategories(storeId: string): Promise<string[]> {
    const { data, error } = await supabase.from('store_taxonomies').select('name')
      .eq('store_id', storeId).eq('domain', domain).eq('is_active', true).order('sort_order').order('id');
    if (error) throw error;
    return (data ?? []).map(row => row.name);
  }
  async function change(storeId: string, action: string, oldName: string | null, newName: string | null) {
    const { error } = await supabase.rpc('change_store_taxonomy', {
      p_store_id: storeId, p_domain: domain, p_action: action, p_old_name: oldName, p_new_name: newName,
    });
    if (error) throw error;
    await invalidateCachedStore(storeId);
  }
  async function addCategory(storeId: string, name: string) { await change(storeId, 'add', null, name); }
  async function renameCategory(storeId: string, oldName: string, newName: string, _current: string[]) {
    await change(storeId, 'rename', oldName, newName);
  }
  async function removeCategory(storeId: string, name: string, _current: string[]) {
    await change(storeId, 'remove', name, linked?.fallback ?? '기타');
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

  return { getCategories, addCategory, renameCategory, removeCategory, countByCategory };
}
