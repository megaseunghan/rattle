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
  data: Partial<Pick<Ingredient, 'name' | 'category' | 'current_stock' | 'unit' | 'min_stock' | 'last_price'>>
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
  const { data, error } = await supabase
    .from('ingredients')
    .insert(items)
    .select('id');

  if (error) throw new Error(error.message);
  return (data ?? []).length;
}
