import { getErrorMessage } from '../utils/error';
import { useState, useCallback, useRef, useMemo } from 'react';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { useAuth } from '../contexts/AuthContext';
import {
  getIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  bulkCreateIngredients,
  updateIngredientCategories,
} from '../services/ingredients';
import { Ingredient } from '../../types';

const PAGE_SIZE = 20;
const CACHE_TTL = 60_000;

interface UseIngredientsResult {
  data: Ingredient[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refetch: (force?: boolean) => Promise<void>;
  loadMore: () => Promise<void>;
  create: (data: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>) => Promise<Ingredient>;
  update: (id: string, data: Partial<Pick<Ingredient, 'name' | 'category' | 'current_stock' | 'unit' | 'min_stock' | 'last_price'>>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  bulkCreate: (items: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>[]) => Promise<number>;
  bulkUpdateCategory: (ids: string[], category: string) => Promise<void>;
}

export function useIngredients(): UseIngredientsResult {
  const { store } = useAuth();
  const scope = useQueryScope();
  const storeId = store?.id;
  const identity = `${scope}:${storeId ?? ''}`;
  const active = useRef(identity);
  active.current = identity;
  const [mutationError, setMutationError] = useState<{ identity: string; message: string } | null>(null);
  const key = queryKeys.store(scope, storeId ?? '', 'ingredients', 'pages', PAGE_SIZE);
  const options = {
    queryKey: key,
    queryFn: ({ pageParam }: { pageParam: number }) => getIngredients(storeId!, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last: Ingredient[], pages: Ingredient[][]) => last.length === PAGE_SIZE ? pages.length : undefined,
    staleTime: CACHE_TTL, gcTime: 15 * 60_000,
  };
  const query = useInfiniteQuery({ ...options, enabled: !!storeId });
  const data = useMemo(() => storeId ? query.data?.pages.flat() ?? [] : [], [storeId, query.data]);
  const loading = !!storeId && query.isPending;
  const loadingMore = query.isFetchingNextPage;
  const hasMore = !!storeId && !!query.hasNextPage;
  const error = mutationError?.identity === identity ? mutationError.message
    : query.error ? getErrorMessage(query.error) : null;
  const refetch = useCallback(async (force = true) => {
    if (!storeId) return;
    if (active.current === identity) setMutationError(null);
    if (force) {
      // Active observers refetch immediately and manual refresh bypasses staleTime.
      await queryClient.invalidateQueries({ queryKey: queryKeys.store(scope, storeId, 'ingredients'), refetchType: 'none' });
    }
    try { await queryClient.fetchInfiniteQuery({
      queryKey: queryKeys.store(scope, storeId, 'ingredients', 'pages', PAGE_SIZE),
      queryFn: ({ pageParam }) => getIngredients(storeId, pageParam, PAGE_SIZE),
      initialPageParam: 0,
      getNextPageParam: (last: Ingredient[], pages: Ingredient[][]) => last.length === PAGE_SIZE ? pages.length : undefined,
      staleTime: CACHE_TTL, gcTime: 15 * 60_000,
    }); } catch (e) {
      if (active.current === identity) setMutationError({ identity, message: getErrorMessage(e) });
    }
  }, [scope, storeId, identity]);
  const loadMore = async () => {
    if (storeId && query.hasNextPage && !query.isFetching) await query.fetchNextPage();
  };

  async function create(ingredientData: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>): Promise<Ingredient> {
    const result = await createIngredient(ingredientData);
    if (active.current === identity) setMutationError(null);
    return result;
  }

  async function update(id: string, ingredientData: Partial<Pick<Ingredient, 'name' | 'category' | 'current_stock' | 'unit' | 'min_stock' | 'last_price'>>) {
    await updateIngredient(id, ingredientData);
    if (active.current === identity) setMutationError(null);
  }

  async function remove(id: string) {
    const cancelling = queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<InfiniteData<Ingredient[], number>>(key);
    const optimistic = previous ? { ...previous, pages: previous.pages.map(page => page.filter(item => item.id !== id)) } : undefined;
    const optimisticVersion = queryClient.setQueryData(key, optimistic);
    try {
      await cancelling;
      await deleteIngredient(id);
      if (active.current === identity) setMutationError(null);
    } catch (e) {
      // Roll back only this optimistic version; never replace a newer result.
      if (queryClient.getQueryData(key) === optimisticVersion) queryClient.setQueryData(key, previous);
      if (active.current === identity) setMutationError({ identity, message: getErrorMessage(e) });
    }
  }

  async function bulkCreate(items: Omit<Ingredient, 'id' | 'updated_at' | 'created_at'>[]) {
    const count = await bulkCreateIngredients(items);
    if (active.current === identity) setMutationError(null);
    return count;
  }

  async function bulkUpdateCategory(ids: string[], category: string) {
    if (!storeId) return;
    await updateIngredientCategories(storeId, ids, category);
    if (active.current === identity) setMutationError(null);
  }

  return { data, loading, loadingMore, hasMore, error, refetch, loadMore, create, update, remove, bulkCreate, bulkUpdateCategory };
}
