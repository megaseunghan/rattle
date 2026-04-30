import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getRecipes,
  createRecipeWithIngredients,
  updateRecipeCategory,
  deleteRecipe,
  RecipeWithIngredients,
} from '../services/recipes';

const PAGE_SIZE = 20;
const CACHE_TTL = 60_000;

interface UseRecipesResult {
  data: RecipeWithIngredients[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  create: (
    name: string,
    category: string,
    sellingPrice: number,
    ingredients: { ingredient_id: string; quantity: number; unit: string }[]
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
  bulkUpdateCategory: (ids: string[], category: string) => Promise<void>;
}

export function useRecipes(): UseRecipesResult {
  const { store } = useAuth();
  const [data, setData] = useState<RecipeWithIngredients[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedAt = useRef(0);

  const refetch = useCallback(async () => {
    if (!store) return;
    if (Date.now() - lastFetchedAt.current < CACHE_TTL) return;
    setLoading(true);
    setError(null);
    setPage(0);
    setHasMore(true);
    try {
      const result = await getRecipes(store.id, 0, PAGE_SIZE);
      setData(result);
      setHasMore(result.length === PAGE_SIZE);
      lastFetchedAt.current = Date.now();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [store]);

  const loadMore = useCallback(async () => {
    if (!store || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await getRecipes(store.id, nextPage, PAGE_SIZE);
      setData(prev => [...prev, ...result]);
      setPage(nextPage);
      setHasMore(result.length === PAGE_SIZE);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }, [store, page, hasMore, loadingMore]);

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
    lastFetchedAt.current = 0;
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

  async function bulkUpdateCategory(ids: string[], category: string) {
    await Promise.all(ids.map(id => updateRecipeCategory(id, category)));
    lastFetchedAt.current = 0;
    await refetch();
  }

  return { data, loading, loadingMore, hasMore, error, refetch, loadMore, create, remove, bulkUpdateCategory };
}
