import { useCallback } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { financialSummaryOptions } from '../query/financial';
import { queryClient, useQueryScope, isAccessDenied } from '../query';
import { getErrorMessage } from '../utils/error';
import { HomeFinancialSummary } from '../../types';
export interface TrendBar {
  key: string;
  label: string;
  data: HomeFinancialSummary | null;
  isCurrent: boolean;
}
/** Independent observers let the selected month's number render before older months. */
export function useProfitLossTrendChart(anchorYear: number, anchorMonth: number, enabled = true) {
  const { store, user, currentRole, canReadFinancials } = useAuth();
  enabled = enabled && canReadFinancials === true;
  const scope = useQueryScope();
  const months = Array.from({ length: 6 }, (_, i) => {
    const date = new Date(anchorYear, anchorMonth - 6 + i, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  });
  const queries = useQueries({ queries: months.map(month => ({
    ...financialSummaryOptions(scope, store?.id ?? '', store?.closing_time ?? '23:00', month, currentRole === 'admin'),
    enabled: enabled && !!store && !!user,
  })) }, queryClient);
  const bars: TrendBar[] = months.map((month, i) => ({ key: month, label: `${Number(month.slice(5))}월`, data: isAccessDenied(queries[i].error) ? null : queries[i].data ?? null, isCurrent: i === 5 }));
  const failures = queries.filter(q => q.isError).length;
  const refetch = useCallback(async () => {
    if (!enabled || !store || !user) return;
    await Promise.all(months.map(month => queryClient.refetchQueries({
      queryKey: financialSummaryOptions(scope, store.id, store.closing_time ?? '23:00', month, currentRole === 'admin').queryKey,
      exact: true,
    })));
  }, [enabled, store?.id, store?.closing_time, user?.id, scope, anchorYear, anchorMonth, currentRole]);
  return { bars: enabled && store && user ? bars : [], loading: enabled && queries.some(q => q.isPending), selectedLoading: enabled && queries[5].isPending,
    updating: queries.some(q => q.isFetching), error: failures ? getErrorMessage(queries.find(q => q.error)?.error, failures === 6 ? '매장 요약을 불러오지 못했어요. 다시 시도해주세요.' : '일부 월의 요약을 불러오지 못했어요. 다시 시도해주세요.') : null, refetch };
}
