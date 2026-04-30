import { supabase } from '../supabase';
import { Recipe, RecipeIngredient, Ingredient } from '../../types';

export type RecipeWithIngredients = Recipe & {
  recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient | null })[];
};

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
  return (data ?? []) as RecipeWithIngredients[];
}

export async function getRecipeById(id: string): Promise<RecipeWithIngredients> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*, ingredient:ingredients(*))')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data as RecipeWithIngredients;
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
}

export async function updateRecipeCategory(id: string, category: string): Promise<void> {
  const { error } = await supabase.from('recipes').update({ category }).eq('id', id);
  if (error) throw new Error(error.message);
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

  return items.length;
}
