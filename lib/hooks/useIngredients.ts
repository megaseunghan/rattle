import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  bulkCreateIngredients,
} from '../services/ingredients';
import { Ingredient } from '../../types';

const PAGE_SIZE = 20;

interface UseIngredientsResult {
  data: Ingredient[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
  create: (data: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>) => Promise<Ingredient>;
  update: (id: string, data: Partial<Pick<Ingredient, 'name' | 'category' | 'current_stock' | 'unit' | 'min_stock' | 'last_price' | 'container_unit' | 'container_size' | 'supplier_name'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  bulkCreate: (items: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>[]) => Promise<number>;
}

export function useIngredients(): UseIngredientsResult {
  const { store } = useAuth();
  const [data, setData] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    setPage(0);
    setHasMore(true);
    try {
      const result = await getIngredients(store.id, 0, PAGE_SIZE);
      setData(result);
      setHasMore(result.length === PAGE_SIZE);
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
      const result = await getIngredients(store.id, nextPage, PAGE_SIZE);
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

  async function create(ingredientData: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>): Promise<Ingredient> {
    const result = await createIngredient(ingredientData);
    await refetch();
    return result;
  }

  async function update(id: string, ingredientData: Partial<Pick<Ingredient, 'name' | 'category' | 'current_stock' | 'unit' | 'min_stock' | 'last_price' | 'container_unit' | 'container_size'>>) {
    await updateIngredient(id, ingredientData);
    await refetch();
  }

  async function remove(id: string) {
    const previous = data;
    setData(prev => prev.filter(item => item.id !== id));
    try {
      await deleteIngredient(id);
    } catch (e: any) {
      setData(previous);
      setError(e.message);
    }
  }

  async function bulkCreate(items: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>[]) {
    const count = await bulkCreateIngredients(items);
    await refetch();
    return count;
  }

  return { data, loading, loadingMore, hasMore, error, refetch, loadMore, create, update, remove, bulkCreate };
}
