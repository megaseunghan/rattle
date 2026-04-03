import { supabase } from '../supabase';

const DEFAULT_CATEGORIES = ['식자재', '주류', '비품소모품'];

export async function getCategories(storeId: string): Promise<string[]> {
  const { data } = await supabase
    .from('stores')
    .select('categories')
    .eq('id', storeId)
    .single();

  return (data?.categories as string[] | null) ?? DEFAULT_CATEGORIES;
}

export async function saveCategories(storeId: string, categories: string[]): Promise<void> {
  const { error } = await supabase
    .from('stores')
    .update({ categories })
    .eq('id', storeId);

  if (error) throw new Error(error.message);
}

export async function renameCategory(
  storeId: string,
  oldName: string,
  newName: string,
  currentCategories: string[],
): Promise<void> {
  const updated = currentCategories.map(c => (c === oldName ? newName : c));
  await saveCategories(storeId, updated);

  // 해당 카테고리 식자재도 일괄 수정
  const { error } = await supabase
    .from('ingredients')
    .update({ category: newName })
    .eq('store_id', storeId)
    .eq('category', oldName);

  if (error) throw new Error(error.message);
}

export async function removeCategory(
  storeId: string,
  name: string,
  currentCategories: string[],
): Promise<void> {
  const updated = currentCategories.filter(c => c !== name);
  await saveCategories(storeId, updated);

  // 해당 카테고리 식자재 → '기타'로 이동
  await supabase
    .from('ingredients')
    .update({ category: '기타' })
    .eq('store_id', storeId)
    .eq('category', name);
}

export async function countIngredientsByCategory(storeId: string, category: string): Promise<number> {
  const { count } = await supabase
    .from('ingredients')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .eq('category', category);

  return count ?? 0;
}
