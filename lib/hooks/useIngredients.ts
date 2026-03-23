import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
} from '../services/ingredients';
import { Ingredient } from '../../types';

interface UseIngredientsResult {
  data: Ingredient[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  create: (data: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>) => Promise<void>;
  update: (id: string, data: Partial<Pick<Ingredient, 'name' | 'category' | 'current_stock' | 'unit' | 'min_stock' | 'last_price'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function useIngredients(): UseIngredientsResult {
  const { store } = useAuth();
  const [data, setData] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getIngredients(store.id);
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

  async function create(ingredientData: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>) {
    await createIngredient(ingredientData);
    await refetch();
  }

  async function update(id: string, ingredientData: Partial<Pick<Ingredient, 'name' | 'category' | 'current_stock' | 'unit' | 'min_stock' | 'last_price'>>) {
    await updateIngredient(id, ingredientData);
    await refetch();
  }

  async function remove(id: string) {
    // Optimistic update: 즉시 UI에서 제거
    const previous = data;
    setData(prev => prev.filter(item => item.id !== id));
    try {
      await deleteIngredient(id);
    } catch (e: any) {
      // 실패 시 복원
      setData(previous);
      setError(e.message);
    }
  }

  return { data, loading, error, refetch, create, update, remove };
}
