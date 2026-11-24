import { usePreviewWriteGuard } from './usePreviewWriteGuard';
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { STALE_TIME } from '../query/staleTimes';
import { CategoryTaxonomy } from '../services/categoryTaxonomy';
import { UserFacingError } from '../utils/error';

export interface CategoryTaxonomyOptions {
  /** false면 자동으로 받지 않는다(숨은 탭). refetch로는 받을 수 있다. */
  active?: boolean;
  /** 캐시 키에 넣을 분류 이름. 분류마다 달라야 한다. */
  cacheName?: string;
}
const EMPTY: string[] = [];
const READ_ERROR = '카테고리를 불러오지 못했어요. 다시 시도해 주세요.';

/** 매장 카테고리 목록(설정류, 30분 재사용). 변경은 서비스의 매장 무효화로 바로 다시 받는다. */
export function useCategoryTaxonomy(taxonomy: CategoryTaxonomy, { active = true, cacheName = 'categories' }: CategoryTaxonomyOptions = {}) {
  const { assertCanWrite } = usePreviewWriteGuard();
  const { store } = useAuth();
  const scope = useQueryScope();
  const storeId = store?.id;
  const query = useQuery({ queryKey: queryKeys.store(scope, storeId ?? '', 'store-taxonomies', cacheName),
    queryFn: () => taxonomy.getCategories(storeId!), enabled: active && !!storeId, staleTime: STALE_TIME.config }, queryClient);
  const { refetch: refetchQuery } = query;
  const refetch = useCallback(async () => {
    if (!storeId) return;
    await refetchQuery();
  }, [storeId, refetchQuery]);
  const categories = storeId ? query.data ?? EMPTY : EMPTY;
  async function change(action: 'add' | 'rename' | 'remove', name: string, next?: string) {
    assertCanWrite();
    if (!storeId) throw new UserFacingError('매장을 선택해 주세요.');
    if (action === 'add') await taxonomy.addCategory(storeId, name);
    else if (action === 'rename') await taxonomy.renameCategory(storeId, name, next!, categories);
    else await taxonomy.removeCategory(storeId, name, categories);
  }
  return { categories, loading: !storeId || query.isPending && !query.isError, error: storeId && query.isError ? READ_ERROR : null, refetch,
    add: (name: string) => change('add', name), rename: (oldName: string, newName: string) => change('rename', oldName, newName), remove: (name: string) => change('remove', name),
    countByCategory: (name: string) => storeId ? taxonomy.countByCategory(storeId, name) : Promise.resolve(0) };
}
