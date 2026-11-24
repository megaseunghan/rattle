import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryClient, queryKeys } from '../query/client';
import { STALE_TIME } from '../query/staleTimes';
import { getStoreWageHistory } from '../services/wageHistory';
import { WageHistory } from '../../types';

type HistoryMap = Record<string, WageHistory[]>;
const EMPTY: HistoryMap = {};

/**
 * 매장 전체 급여 조건 이력을 직원별로 묶어 둔다(인건비 상세, 1분 재사용).
 * 같은 매장 재조회는 기존 이력을 보여 둔 채 새로 받고, 매장·계정·권한 범위가 바뀌면 다른 키라 이전 이력이 보이지 않는다.
 * active가 false면 자동으로 받지 않고 refetch로만 받는다.
 */
export function useStoreWageHistory(storeId: string | undefined, accessScope = '', active = false) {
  const query = useQuery({ queryKey: queryKeys.store(accessScope, storeId ?? '', 'wage-history'),
    queryFn: () => getStoreWageHistory(storeId!), enabled: active && !!storeId, staleTime: STALE_TIME.moneyDetail }, queryClient);
  const { refetch: refetchQuery } = query;
  const refetch = useCallback(async () => {
    if (!storeId) return;
    await refetchQuery();
  }, [storeId, refetchQuery]);
  const rows = storeId ? query.data : undefined;
  const map = useMemo(() => {
    if (!rows) return EMPTY;
    const grouped: HistoryMap = {};
    for (const row of rows) (grouped[row.employee_id] ??= []).push(row);
    return grouped;
  }, [rows]);
  return { map, loading: !!storeId && rows === undefined && !query.isError, error: !!storeId && query.isError, refetch };
}
