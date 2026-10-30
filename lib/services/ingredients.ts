import { invalidateCachedStore } from './cacheInvalidation';
import { supabase } from '../supabase';
import { Ingredient } from '../../types';
import { notifyIfEnabled } from './notifications';

export async function getIngredients(
  storeId: string,
  page?: number,
  pageSize = 20
): Promise<Ingredient[]> {
  let query = supabase
    .from('ingredients')
    .select('*')
    .eq('store_id', storeId)
    .order('name', { ascending: true });

  if (page !== undefined) {
    const from = page * pageSize;
    query = query.range(from, from + pageSize - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Ingredient[];
}

export async function getIngredientById(id: string): Promise<Ingredient> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as Ingredient;
}

export async function createIngredient(
  data: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>
): Promise<Ingredient> {
  const { data: result, error } = await supabase
    .from('ingredients')
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(error.message);
  await invalidateCachedStore(data.store_id);
  return result as Ingredient;
}

export async function updateIngredient(
  id: string,
  data: Partial<Pick<Ingredient, 'name' | 'category' | 'current_stock' | 'unit' | 'min_stock' | 'last_price' | 'unit_volume' | 'unit_volume_unit'>>
): Promise<Ingredient> {
  const { data: result, error } = await supabase
    .from('ingredients')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  const ingredient = result as Ingredient;

  if (data.current_stock !== undefined && ingredient.current_stock <= ingredient.min_stock) {
    notifyIfEnabled({
      storeId: ingredient.store_id,
      settingKey: 'stock_low',
      category: 'stock',
      type: 'low_stock',
      title: '품절 임박',
      message: `${ingredient.name}이(가) ${ingredient.current_stock}${ingredient.unit} 남았어요`,
      dedupeKey: `low_stock:${ingredient.id}:${new Date().toISOString().slice(0, 10)}`,
    }).catch(() => {});
  }

  await invalidateCachedStore();
  return ingredient;
}

export async function deleteIngredient(id: string): Promise<void> {
  const { error } = await supabase
    .from('ingredients')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  await invalidateCachedStore();
}

export async function getIngredientsByCategory(storeId: string, category: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('id, name')
    .eq('store_id', storeId)
    .eq('category', category)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}

export async function bulkCreateIngredients(
  items: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>[]
): Promise<number> {
  if (items.length === 0) return 0;

  const storeId = items[0].store_id;
  const existing = await getIngredients(storeId);
  const existingByName = new Map(existing.map((e) => [e.name, e]));

  const toInsert = items.filter((item) => !existingByName.has(item.name));
  const toUpdate = items.filter((item) => existingByName.has(item.name));

  const updates = toUpdate.map((item) => {
    const found = existingByName.get(item.name)!;
    return supabase
      .from('ingredients')
      .update({
        current_stock: found.current_stock + item.current_stock,
        min_stock: item.min_stock,
        last_price: item.last_price,
        updated_at: new Date().toISOString(),
      })
      .eq('id', found.id);
  });

  const results = await Promise.all(updates);
  const failed = results.find(result => result.error);
  if (failed?.error) {
    await invalidateCachedStore(storeId);
    throw new Error(failed.error.message);
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('ingredients').insert(toInsert);
    if (error) throw new Error(error.message);
  }

  await invalidateCachedStore();
  return toInsert.length + toUpdate.length;
}

/** One store-scoped update and one cache invalidation for the whole selection. */
export async function updateIngredientCategories(storeId: string, ids: string[], category: string): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('ingredients').update({ category, updated_at: new Date().toISOString() })
    .in('id', [...new Set(ids)]).eq('store_id', storeId);
  if (error) throw new Error(error.message);
  await invalidateCachedStore(storeId);
}
