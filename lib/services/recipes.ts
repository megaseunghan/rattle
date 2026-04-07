import { supabase } from '../supabase';
import { Recipe, RecipeIngredient, Ingredient } from '../../types';

export type RecipeWithIngredients = Recipe & {
  recipe_ingredients: (RecipeIngredient & { ingredient: Ingredient | null })[];
};

export async function getRecipes(storeId: string): Promise<RecipeWithIngredients[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*, ingredient:ingredients(*))')
    .eq('store_id', storeId)
    .order('name', { ascending: true });

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
  // 1. 기본 정보 업데이트
  const { error: updateError } = await supabase
    .from('recipes')
    .update({
      name,
      category,
      selling_price: sellingPrice,
    })
    .eq('id', id);

  if (updateError) throw new Error(updateError.message);

  // 2. 기존 재료 삭제
  const { error: deleteError } = await supabase
    .from('recipe_ingredients')
    .delete()
    .eq('recipe_id', id);

  if (deleteError) throw new Error(deleteError.message);

  // 3. 새 재료 삽입
  const { error: insertError } = await supabase
    .from('recipe_ingredients')
    .insert(
      ingredients.map(i => ({
        recipe_id: id,
        ...i,
      }))
    );

  if (insertError) throw new Error(insertError.message);
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
