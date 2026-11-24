import type { PurchaseFormInput } from '../services/purchases';
import { usePreviewWriteGuard } from './usePreviewWriteGuard';
import { getErrorMessage, UserFacingError } from '../utils/error';
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { STALE_TIME } from '../query/staleTimes';
import { useAuth } from '../contexts/AuthContext';
import { getPurchasesWithItemCountsByMonth, createPurchase, deletePurchase, createPurchaseWithItems } from '../services/purchases';
import { Purchase, PurchaseCategory, PurchaseType } from '../../types';

const EMPTY: Purchase[] = [];

/**
 * 월별 매입 목록(5분 재사용). 등록·수정·삭제는 서비스의 무효화('purchases' 또는 매장 전체)로 바로 반영된다.
 * active가 false면 자동으로 받지 않는다(숨은 탭·월 확인 창을 열기 전).
 */
export function usePurchases(yearMonth: string, active = true) {
  const { assertCanWrite } = usePreviewWriteGuard();
  const { store } = useAuth();
  const scope = useQueryScope();
  const storeId = store?.id;
  const key = useMemo(() => queryKeys.store(scope, storeId ?? '', 'purchases', yearMonth), [scope, storeId, yearMonth]);
  const query = useQuery({ queryKey: key, queryFn: () => getPurchasesWithItemCountsByMonth(storeId!, yearMonth),
    enabled: active && !!storeId, staleTime: STALE_TIME.entry }, queryClient);
  const { refetch: refetchQuery } = query;

  /** 당겨서 새로고침·다시 시도. 성공하면 true. */
  const refetch = useCallback(async () => {
    if (!storeId) return false;
    const result = await refetchQuery();
    return !result.isError;
  }, [storeId, refetchQuery]);

  const add = useCallback(async (data: {
    date: string;
    supplier: string;
    amount: number;
    category: PurchaseCategory;
    type: PurchaseType;
    note?: string | null;
  }) => {
    assertCanWrite();
    if (!store) throw new UserFacingError('매장 정보가 없습니다');
    return createPurchase({ ...data, store_id: store.id });
  }, [store, assertCanWrite]);

  const addWithItems = useCallback(async (data: PurchaseFormInput) => {
    assertCanWrite();
    if (!store) throw new UserFacingError('매장 정보가 없습니다');
    return createPurchaseWithItems({ ...data, store_id: store.id });
  }, [store, assertCanWrite]);

  const remove = useCallback(async (id: string) => {
    assertCanWrite();
    await deletePurchase(id);
  }, [assertCanWrite]);

  // 다시 받다가 실패해도 같은 키의 이전 목록은 유지하고 오류를 함께 보여준다.
  const loaded = !!storeId && query.data !== undefined;
  return { loaded, purchases: loaded ? query.data ?? EMPTY : EMPTY, loading: !!storeId && query.isPending && !query.isError,
    error: storeId && query.isError ? getErrorMessage(query.error) : null, refetch, add, addWithItems, remove };
}
