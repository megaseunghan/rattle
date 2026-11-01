import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { isAccessDenied, queryClient, queryKeys, useQueryScope } from '../query';
import { getErrorMessage } from '../utils/error';
import { getPendingScheduleRequests, reviewScheduleRequest } from '../services/schedule';
import { ScheduleRequest } from '../../types';
type RequestRow = ScheduleRequest & { employee_name: string };
const EMPTY: RequestRow[] = [];
/** 관리자 요청함: 조회 실패와 실제 빈 목록을 구분한다. */
export function useRequestApprovals() {
  const { store } = useAuth();
  const accessScope = useQueryScope(); const storeId = store?.id;
  const scope = `${accessScope}:${storeId}`;
  const active = useRef(scope); active.current = scope;
  useEffect(() => { active.current = scope; return () => { active.current = ''; }; }, [scope]);
  const lock = useRef<string | null>(null);
  const uncertain = useRef(new Set<string>());
  const reads = useRef(new Map<string, number>());
  const [action, setAction] = useState<{ scope: string; id: string | null; error: string | null } | null>(null);
  const key = queryKeys.store(accessScope, storeId ?? '', 'schedule', 'requests');
  const query = useQuery({ queryKey: key, queryFn: () => getPendingScheduleRequests(storeId!), enabled: false }, queryClient);
  const scheduleRequests = storeId && !isAccessDenied(query.error) ? query.data ?? EMPTY : EMPTY;
  const error = query.error ? getErrorMessage(query.error) : null;
  const actionError = action?.scope === scope ? action.error : null;
  const refetch = useCallback(async () => {
    if (!storeId || lock.current === scope) return;
    reads.current.set(scope, (reads.current.get(scope) ?? 0) + 1);
    try {
      const result = await query.refetch();
      if (!result.error) {
        uncertain.current.delete(scope);
        if (active.current === scope) setAction(null);
      }
    } finally { reads.current.set(scope, Math.max(0, (reads.current.get(scope) ?? 1) - 1)); }
  }, [storeId, scope, query.refetch]);
  const reviewSchedule = useCallback(async (request: ScheduleRequest, approve: boolean) => {
    if (!storeId || active.current !== scope || request.store_id !== storeId || lock.current || uncertain.current.has(scope) || (reads.current.get(scope) ?? 0) > 0 || !query.isSuccess || query.isFetching || actionError || !scheduleRequests.some(row => row.id === request.id)) return;
    lock.current = scope; setAction({ scope, id: request.id, error: null });
    try {
      await reviewScheduleRequest(request, approve);
      await queryClient.cancelQueries({ queryKey: key, exact: true });
      queryClient.setQueryData<RequestRow[]>(key, previous => (previous ?? []).filter(row => row.id !== request.id));
      if (active.current === scope) setAction(null);
    } catch {
      uncertain.current.add(scope);
      if (active.current === scope) setAction({ scope, id: null, error: '처리 결과를 확인하지 못했어요. 일부 반영됐을 수 있으니 다시 불러와 확인해주세요.' });
    } finally { if (lock.current === scope) lock.current = null; }
  }, [storeId, scope, key, query.isSuccess, query.isFetching, actionError, scheduleRequests]);
  return { scheduleRequests, loading: !!storeId && query.isPending && !query.error,
    refreshing: query.isFetching, ready: !!storeId && query.isSuccess, error, actionError,
    reviewingId: action?.scope === scope ? action.id : null,
    totalPending: error || actionError ? null : scheduleRequests.length, refetch, reviewSchedule };
}
