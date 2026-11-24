import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { queryClient, queryKeys, useQueryScope } from '../query';
import { STALE_TIME } from '../query/staleTimes';
import { PayrollWorkSubmission } from '../../types';
import { getPayrollSubmissions } from '../services/payrollSubmissions';

const EMPTY: PayrollWorkSubmission[] = [];
const READ_ERROR = '근무시간 제출 내역을 불러오지 못했어요. 다시 시도해주세요.';

/**
 * 파트타이머 근무시간 제출(다른 사용자가 바꾸는 자료, 1분 재사용).
 * 제출·검토는 서비스가 'payroll-submissions'를 무효화한다. active가 false면 refetch로만 받는다.
 */
export function usePayrollSubmissions(yearMonth: string, employeeId?: string, active = false) {
  const { store } = useAuth();
  const scope = useQueryScope();
  const storeId = store?.id;
  const query = useQuery({ queryKey: queryKeys.store(scope, storeId ?? '', 'payroll-submissions', yearMonth, employeeId ?? null),
    queryFn: () => getPayrollSubmissions(storeId!, yearMonth, employeeId), enabled: active && !!storeId, staleTime: STALE_TIME.moneyDetail }, queryClient);
  const { refetch: refetchQuery } = query;
  /** 다시 받기. 조회 실패면 false를 돌려 제출 성공과 조회 실패를 구분하게 한다. */
  const refetch = useCallback(async () => {
    if (!storeId) return false;
    const result = await refetchQuery();
    return !result.isError;
  }, [storeId, refetchQuery]);
  const rows = storeId ? query.data : undefined;
  return { rows: rows ?? EMPTY, loading: !!storeId && rows === undefined && !query.isError,
    error: storeId && query.isError ? READ_ERROR : null, refetch };
}
