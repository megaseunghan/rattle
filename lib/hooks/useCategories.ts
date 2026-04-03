import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getCategories,
  saveCategories,
  renameCategory as renameCategoryService,
  removeCategory as removeCategoryService,
  countIngredientsByCategory,
} from '../services/categories';

export function useCategories() {
  const { store } = useAuth();
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const cats = await getCategories(store.id);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => { refetch(); }, [refetch]);

  async function add(name: string): Promise<void> {
    if (!store) return;
    const updated = [...categories, name];
    await saveCategories(store.id, updated);
    setCategories(updated);
  }

  async function rename(oldName: string, newName: string): Promise<void> {
    if (!store) return;
    await renameCategoryService(store.id, oldName, newName, categories);
    setCategories(categories.map(c => (c === oldName ? newName : c)));
  }

  async function remove(name: string): Promise<void> {
    if (!store) return;
    await removeCategoryService(store.id, name, categories);
    setCategories(categories.filter(c => c !== name));
  }

  async function countByCategory(category: string): Promise<number> {
    if (!store) return 0;
    return countIngredientsByCategory(store.id, category);
  }

  return { categories, loading, refetch, add, rename, remove, countByCategory };
}
