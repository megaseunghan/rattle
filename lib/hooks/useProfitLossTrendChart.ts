import { getErrorMessage } from '../utils/error';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getProfitLossByMonth } from '../services/profitLoss';
import { ProfitLoss } from '../../types';

export interface TrendBar {
  key: string;
  label: string;
  data: ProfitLoss | null; // 조회 실패도 월 위치를 유지한다. 0원과 구분한다.
  isCurrent: boolean;
}

interface TrendState {
  scope: string | null;
  bars: TrendBar[];
  loading: boolean;
  error: string | null;
}

/** 선택한 달까지 최근 6개월. 새로고침으로 최신 값을 읽고, 매장·월 변경 전 응답은 버린다. */
export function useProfitLossTrendChart(anchorYear: number, anchorMonth: number) {
  const { store } = useAuth();
  const storeId = store?.id;
  const closingTime = store?.closing_time?.slice(0, 5) ?? '23:00';
  const scope = storeId ? `${storeId}:${closingTime}:${anchorYear}-${anchorMonth}` : null;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const requestId = useRef(0);
  const [state, setState] = useState<TrendState>({ scope: null, bars: [], loading: false, error: null });

  useEffect(() => () => { requestId.current += 1; }, []);

  const refetch = useCallback(async () => {
    const request = ++requestId.current;
    if (!storeId) {
      setState({ scope: null, bars: [], loading: false, error: null });
      return;
    }
    setState(previous => ({ scope, bars: previous.scope === scope ? previous.bars : [], loading: true, error: null }));
    const results = await Promise.all(Array.from({ length: 6 }, async (_, index) => {
      const date = new Date(anchorYear, anchorMonth - 6 + index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const bar: TrendBar = { key, label: `${date.getMonth() + 1}월`, data: null, isCurrent: index === 5 };
      try {
        return { bar: { ...bar, data: await getProfitLossByMonth(storeId, key, closingTime) }, error: null };
      } catch (error) {
        return { bar, error: getErrorMessage(error, '조회 실패') };
      }
    }));
    if (request !== requestId.current || currentScope.current !== scope) return;
    const failure = results.find(result => result.error);
    setState({ scope, bars: results.map(result => result.bar), loading: false, error: failure ? '일부 월의 손익을 불러오지 못했어요. 다시 시도해 주세요.' : null });
  }, [storeId, closingTime, anchorYear, anchorMonth, scope]);

  const visible = state.scope === scope;
  return {
    bars: visible ? state.bars : [],
    loading: visible ? state.loading : !!storeId,
    error: visible ? state.error : null,
    refetch,
  };
}
