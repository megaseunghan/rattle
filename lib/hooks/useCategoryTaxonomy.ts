import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CategoryTaxonomy } from '../services/categoryTaxonomy';

export function useCategoryTaxonomy(taxonomy: CategoryTaxonomy) {
  const { store } = useAuth();
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const cats = await taxonomy.getCategories(store.id);
      setCategories(cats);
    } finally {
      setLoading(false);
    }
  }, [store, taxonomy]);

  useEffect(() => { refetch(); }, [refetch]);

  async function add(name: string): Promise<void> {
    if (!store) return;
    const updated = [...categories, name];
    await taxonomy.saveCategories(store.id, updated);
    setCategories(updated);
  }

  async function rename(oldName: string, newName: string): Promise<void> {
    if (!store) return;
    await taxonomy.renameCategory(store.id, oldName, newName, categories);
    setCategories(categories.map(c => (c === oldName ? newName : c)));
  }

  async function remove(name: string): Promise<void> {
    if (!store) return;
    await taxonomy.removeCategory(store.id, name, categories);
    setCategories(categories.filter(c => c !== name));
  }

  async function countByCategory(category: string): Promise<number> {
    if (!store) return 0;
    return taxonomy.countByCategory(store.id, category);
  }

  return { categories, loading, refetch, add, rename, remove, countByCategory };
}
