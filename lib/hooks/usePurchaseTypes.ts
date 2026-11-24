import { UserFacingError } from '../utils/error';
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { STALE_TIME } from '../query/staleTimes';
import { changePurchaseType, DEFAULT_PURCHASE_TYPES, getPurchaseTypes } from '../services/purchaseTypes';

const READ_ERROR = '매입 유형을 불러오지 못했어요. 다시 시도해주세요.';

/** 매장 매입 유형(설정류, 30분 재사용). 변경 결과는 서버 응답으로 바로 캐시에 넣는다. */
export function usePurchaseTypes(active = true) {
  const { store } = useAuth();
  const scope = useQueryScope();
  const storeId = store?.id;
  const key = useMemo(() => queryKeys.store(scope, storeId ?? '', 'store-taxonomies', 'purchase-types'), [scope, storeId]);
  const query = useQuery({ queryKey: key, queryFn: () => getPurchaseTypes(storeId!),
    enabled: active && !!storeId, staleTime: STALE_TIME.config }, queryClient);
  const { refetch: refetchQuery } = query;
  const refetch = useCallback(async () => {
    if (!storeId) return;
    await refetchQuery();
  }, [storeId, refetchQuery]);
  const change = useCallback(async (oldName: string | null, newName: string) => {
    if (!storeId) throw new UserFacingError('매장을 선택해 주세요.');
    const types = await changePurchaseType(storeId, oldName, newName);
    await queryClient.cancelQueries({ queryKey: key, exact: true });
    queryClient.setQueryData(key, types);
  }, [storeId, key]);
  const visible = !!storeId;
  return { types: visible ? query.data ?? DEFAULT_PURCHASE_TYPES : DEFAULT_PURCHASE_TYPES, loading: visible && query.isFetching && query.isPending,
    error: visible && query.isError ? READ_ERROR : null, refetch,
    add: (name: string) => change(null, name), rename: (oldName: string, newName: string) => change(oldName, newName) };
}
