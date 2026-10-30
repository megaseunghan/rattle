import { getErrorMessage } from '../utils/error';
import { useState, useCallback, useRef, useMemo } from 'react';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { useAuth } from '../contexts/AuthContext';
import {
  getRecipes,
  createRecipeWithIngredients,
  updateRecipeCategories,
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
  refetch: (force?: boolean) => Promise<void>;
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
  const scope = useQueryScope();
  const storeId = store?.id;
  const identity = `${scope}:${storeId ?? ''}`;
  const active = useRef(identity);
  active.current = identity;
  const [mutationError, setMutationError] = useState<{ identity: string; message: string } | null>(null);
  const key = queryKeys.store(scope, storeId ?? '', 'recipes', 'pages', PAGE_SIZE);
  const options = {
    queryKey: key,
    queryFn: ({ pageParam }: { pageParam: number }) => getRecipes(storeId!, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (last: RecipeWithIngredients[], pages: RecipeWithIngredients[][]) => last.length === PAGE_SIZE ? pages.length : undefined,
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.store(scope, storeId, 'recipes'), refetchType: 'none' });
    }
    try { await queryClient.fetchInfiniteQuery({
      queryKey: queryKeys.store(scope, storeId, 'recipes', 'pages', PAGE_SIZE),
      queryFn: ({ pageParam }) => getRecipes(storeId, pageParam, PAGE_SIZE),
      initialPageParam: 0,
      getNextPageParam: (last: RecipeWithIngredients[], pages: RecipeWithIngredients[][]) => last.length === PAGE_SIZE ? pages.length : undefined,
      staleTime: CACHE_TTL, gcTime: 15 * 60_000,
    }); } catch (e) {
      if (active.current === identity) setMutationError({ identity, message: getErrorMessage(e) });
    }
  }, [scope, storeId, identity]);
  const loadMore = async () => {
    if (storeId && query.hasNextPage && !query.isFetching) await query.fetchNextPage();
  };

  async function create(
    name: string,
    category: string,
    sellingPrice: number,
    ingredients: { ingredient_id: string; quantity: number; unit: string }[]
  ) {
    if (!store) return;
    await createRecipeWithIngredients(store.id, name, category, sellingPrice, ingredients);
    if (active.current === identity) setMutationError(null);
  }

  const remove = useCallback(async (id: string) => {
    const key = queryKeys.store(scope, storeId ?? '', 'recipes', 'pages', PAGE_SIZE);
    const cancelling = queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<InfiniteData<RecipeWithIngredients[], number>>(key);
    const optimistic = previous ? { ...previous, pages: previous.pages.map(page => page.filter(item => item.id !== id)) } : undefined;
    const optimisticVersion = queryClient.setQueryData(key, optimistic);
    try {
      await cancelling;
      await deleteRecipe(id);
      if (active.current === identity) setMutationError(null);
    } catch (e) {
      // Roll back only this optimistic version; never replace a newer result.
      if (queryClient.getQueryData(key) === optimisticVersion) queryClient.setQueryData(key, previous);
      if (active.current === identity) setMutationError({ identity, message: getErrorMessage(e) });
    }
  }, [scope, storeId, identity]);

  async function bulkUpdateCategory(ids: string[], category: string) {
    if (!storeId) return;
    await updateRecipeCategories(storeId, ids, category);
    if (active.current === identity) setMutationError(null);
  }

  return { data, loading, loadingMore, hasMore, error, refetch, loadMore, create, remove, bulkUpdateCategory };
}
