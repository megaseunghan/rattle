import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getRecipes,
  createRecipeWithIngredients,
  updateRecipe,
  deleteRecipe,
  RecipeWithIngredients,
} from '../services/recipes';
import { Recipe } from '../../types';

interface UseRecipesResult {
  data: RecipeWithIngredients[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  create: (
    name: string,
    category: string,
    sellingPrice: number,
    ingredients: { ingredient_id: string; quantity: number; unit: string }[]
  ) => Promise<void>;
  update: (id: string, data: Partial<Pick<Recipe, 'name' | 'category' | 'selling_price'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useRecipes(): UseRecipesResult {
  const { store } = useAuth();
  const [data, setData] = useState<RecipeWithIngredients[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getRecipes(store.id);
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function create(
    name: string,
    category: string,
    sellingPrice: number,
    ingredients: { ingredient_id: string; quantity: number; unit: string }[]
  ) {
    if (!store) return;
    await createRecipeWithIngredients(store.id, name, category, sellingPrice, ingredients);
    await refetch();
  }

  async function update(id: string, recipeData: Partial<Pick<Recipe, 'name' | 'category' | 'selling_price'>>) {
    await updateRecipe(id, recipeData);
    await refetch();
  }

  async function remove(id: string) {
    const previous = data;
    setData(prev => prev.filter(item => item.id !== id));
    try {
      await deleteRecipe(id);
    } catch (e: any) {
      setData(previous);
      setError(e.message);
    }
  }

  return { data, loading, error, refetch, create, update, remove };
}
