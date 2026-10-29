import { invalidateCachedStore } from './cacheInvalidation';
import { supabase } from '../supabase';
import { Recipe, RecipeIngredient, Ingredient } from '../../types';

export type RecipeWithIngredients = Recipe & {
  recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient | null })[];
};

async function withCurrentCosts(rows: RecipeWithIngredients[]): Promise<RecipeWithIngredients[]> {
  if (!rows.length) return rows;
  const { data, error } = await supabase.from('recipe_costs').select('recipe_id,cost,margin_rate')
    .in('recipe_id', rows.map(row => row.id));
  if (error) throw error;
  const costs = new Map((data ?? []).map(row => [row.recipe_id, row]));
  return rows.map(row => {
    const cost = costs.get(row.id);
    if (!cost || cost.cost == null || cost.margin_rate == null
      || !Number.isFinite(Number(cost.cost)) || !Number.isFinite(Number(cost.margin_rate))) {
      throw new Error('RECIPE_COST_REQUIRED');
    }
    return { ...row, cost: Number(cost.cost), margin_rate: Number(cost.margin_rate) };
  });
}

export async function getRecipes(
  storeId: string,
  page?: number,
  pageSize = 20
): Promise<RecipeWithIngredients[]> {
  let query = supabase
    .from('recipes')
    .select('*, recipe_ingredients(*, ingredient:ingredients(*))')
    .eq('store_id', storeId)
    .order('name', { ascending: true });

  if (page !== undefined) {
    const from = page * pageSize;
    query = query.range(from, from + pageSize - 1);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return withCurrentCosts((data ?? []) as RecipeWithIngredients[]);
}

export async function getRecipeById(id: string): Promise<RecipeWithIngredients> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*, ingredient:ingredients(*))')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return (await withCurrentCosts([data as RecipeWithIngredients]))[0];
}

export async function createRecipeWithIngredients(
  storeId: string,
  name: string,
  category: string,
  sellingPrice: number,
  ingredients: { ingredient_id: string; quantity: number; unit: string }[]
): Promise<string> {
  const { data, error } = await supabase.rpc('create_recipe_with_ingredients', {
    p_store_id: storeId,
    p_name: name,
    p_category: category,
    p_selling_price: sellingPrice,
    p_ingredients: ingredients,
  });

  if (error) throw new Error(error.message);
  await invalidateCachedStore(storeId);
  return data as string;
}
export async function updateRecipeFull(
  id: string,
  name: string,
  category: string,
  sellingPrice: number,
  ingredients: { ingredient_id: string; quantity: number; unit: string }[]
): Promise<void> {
  const { error } = await supabase.rpc('update_recipe_full', {
    p_recipe_id: id,
    p_name: name,
    p_category: category,
    p_selling_price: sellingPrice,
    p_ingredients: ingredients,
  });
  if (error) throw new Error(error.message);
  await invalidateCachedStore();
}

export async function updateRecipeCategory(id: string, category: string): Promise<void> {
  const { error } = await supabase.from('recipes').update({ category }).eq('id', id);
  if (error) throw new Error(error.message);
  await invalidateCachedStore();
}

export async function renameRecipeCategory(
  storeId: string,
  oldName: string,
  newName: string
): Promise<void> {
  const { error } = await supabase
    .from('recipes')
    .update({ category: newName })
    .eq('store_id', storeId)
    .eq('category', oldName);

  if (error) throw new Error(error.message);
  await invalidateCachedStore(storeId);
}

export async function deleteRecipeCategory(
  storeId: string,
  category: string
): Promise<void> {
  const { error } = await supabase
    .from('recipes')
    .update({ category: '미분류' })
    .eq('store_id', storeId)
    .eq('category', category);

  if (error) throw new Error(error.message);
  await invalidateCachedStore(storeId);
}

export async function getRecipesByCategory(storeId: string, category: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id, name')
    .eq('store_id', storeId)
    .eq('category', category)
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  await invalidateCachedStore();
}

export async function upsertRecipesFromCatalog(
  storeId: string,
  items: { name: string; category: string; sellingPrice: number }[]
): Promise<number> {
  if (items.length === 0) return 0;

  // 1. 현재 매장의 레시피 이름 목록 조회
  const { data: existing, error: fetchError } = await supabase
    .from('recipes')
    .select('id, name')
    .eq('store_id', storeId);

  if (fetchError) throw new Error(fetchError.message);

  const existingMap = new Map((existing ?? []).map(r => [r.name.trim(), r.id]));

  const toUpdate = items.filter(i => existingMap.has(i.name.trim()));
  const toInsert = items.filter(i => !existingMap.has(i.name.trim()));

  // 2. 기존 레시피 selling_price 업데이트 (재료/원가는 보존)
  // 개별 UPDATE 호출로 완전한 원자성을 보장하지 않음. 부분 실패 시 일부만 반영될 수 있음.
  const updateResults = await Promise.all(
    toUpdate.map(i =>
      supabase
        .from('recipes')
        .update({ selling_price: i.sellingPrice })
        .eq('id', existingMap.get(i.name.trim())!)
    )
  );
  for (const { error } of updateResults) {
    if (error) throw new Error(error.message);
  }

  // 3. 신규 레시피 삽입
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('recipes')
      .insert(
        toInsert.map(i => ({
          store_id: storeId,
          name: i.name,
          category: i.category,
          selling_price: i.sellingPrice,
          cost: 0,
          margin_rate: 0,
        }))
      );
    if (insertError) throw new Error(insertError.message);
  }

  await invalidateCachedStore(storeId);
  return items.length;
}

/** One store-scoped update and one cache invalidation for the whole selection. */
export async function updateRecipeCategories(storeId: string, ids: string[], category: string): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from('recipes').update({ category })
    .in('id', [...new Set(ids)]).eq('store_id', storeId);
  if (error) throw new Error(error.message);
  await invalidateCachedStore(storeId);
}
