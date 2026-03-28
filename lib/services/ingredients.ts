import { supabase } from '../supabase';
import { Ingredient } from '../../types';

export async function getIngredients(storeId: string): Promise<Ingredient[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('*')
    .eq('store_id', storeId)
    .order('name', { ascending: true });

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
  return result as Ingredient;
}

export async function updateIngredient(
  id: string,
  data: Partial<Pick<Ingredient, 'name' | 'category' | 'current_stock' | 'unit' | 'min_stock' | 'last_price' | 'container_unit' | 'container_size' | 'supplier_name'>>
): Promise<Ingredient> {
  const { data: result, error } = await supabase
    .from('ingredients')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return result as Ingredient;
}

export async function deleteIngredient(id: string): Promise<void> {
  const { error } = await supabase
    .from('ingredients')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
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
        container_unit: item.container_unit,
        container_size: item.container_size,
        updated_at: new Date().toISOString(),
      })
      .eq('id', found.id);
  });

  await Promise.all(updates);

  if (toInsert.length > 0) {
    const { error } = await supabase.from('ingredients').insert(toInsert);
    if (error) throw new Error(error.message);
  }

  return toInsert.length + toUpdate.length;
}
