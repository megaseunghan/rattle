import { useEffect, useCallback, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { CategoryTaxonomy } from '../services/categoryTaxonomy';
import { UserFacingError } from '../utils/error';

export function useCategoryTaxonomy(taxonomy: CategoryTaxonomy) {
  const { store } = useAuth();
  const storeId = store?.id;
  const currentStore = useRef(storeId);
  currentStore.current = storeId;
  const request = useRef(0);
  const [state, setState] = useState<{ storeId?: string; categories: string[]; loading: boolean; error: string | null }>({ categories: [], loading: true, error: null });
  useEffect(() => () => { request.current += 1; }, []);
  const refetch = useCallback(async () => {
    const id = ++request.current;
    if (!storeId) return;
    setState(previous => ({ storeId, categories: previous.storeId === storeId ? previous.categories : [], loading: true, error: null }));
    try {
      const categories = await taxonomy.getCategories(storeId);
      if (id === request.current && currentStore.current === storeId) setState({ storeId, categories, loading: false, error: null });
    } catch {
      if (id === request.current && currentStore.current === storeId) setState(previous => ({ ...previous, loading: false, error: '카테고리를 불러오지 못했어요. 다시 시도해 주세요.' }));
    }
  }, [storeId, taxonomy]);
  useEffect(() => { void refetch(); }, [refetch]);
  const categories = state.storeId === storeId ? state.categories : [];
  async function change(action: 'add' | 'rename' | 'remove', name: string, next?: string) {
    if (!storeId) throw new UserFacingError('매장을 선택해 주세요.');
    if (action === 'add') await taxonomy.addCategory(storeId, name);
    else if (action === 'rename') await taxonomy.renameCategory(storeId, name, next!, categories);
    else await taxonomy.removeCategory(storeId, name, categories);
    if (currentStore.current === storeId) await refetch();
  }
  return { categories, loading: state.storeId !== storeId || state.loading, error: state.storeId === storeId ? state.error : null, refetch,
    add: (name: string) => change('add', name), rename: (oldName: string, newName: string) => change('rename', oldName, newName), remove: (name: string) => change('remove', name),
    countByCategory: (name: string) => storeId ? taxonomy.countByCategory(storeId, name) : Promise.resolve(0) };
}
