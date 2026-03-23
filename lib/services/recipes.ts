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

export async function updateRecipe(
  id: string,
  data: Partial<Pick<Recipe, 'name' | 'category' | 'selling_price'>>
): Promise<Recipe> {
  const { data: result, error } = await supabase
    .from('recipes')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return result as Recipe;
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
