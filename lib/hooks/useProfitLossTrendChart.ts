import { useCallback, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getProfitLossByMonth } from '../services/profitLoss';
import { ProfitLoss } from '../../types';

export interface TrendBar {
  key: string;
  label: string;
  data: ProfitLoss | null; // null = 아직 오지 않은 미래 달 (오늘 이전이면 실제 데이터를 채워서 보여준다)
  isCurrent: boolean;
}

// 선택한 달을 가운데 두고, 이전 3개월 + 선택한 달 + 이후 3개월(빈 막대)을 보여준다
const BEFORE_COUNT = 3;
const AFTER_COUNT = 3;

function shiftYearMonth(anchorYearMonth: string, offset: number): string {
  const [ay, am] = anchorYearMonth.split('-').map(Number);
  const d = new Date(ay, am - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(yearMonth: string): string {
  return `${Number(yearMonth.slice(5, 7))}월`;
}

/** 홈 화면 막대그래프 — 선택한 달이 가운데 오도록 이전 몇 달치 손익만 조회하고, 이후 달은 빈 막대로 둔다.
 * 이미 조회한 달은 캐시에서 재사용해 이동할 때마다 반복 조회하지 않는다. */
export function useProfitLossTrendChart(anchorYear: number, anchorMonth: number) {
  const { store } = useAuth();
  const cacheRef = useRef<Map<string, ProfitLoss>>(new Map());
  const [bars, setBars] = useState<TrendBar[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const closingTime = (store.closing_time as string | null | undefined)?.slice(0, 5) ?? '23:00';
      const anchorYm = `${anchorYear}-${String(anchorMonth).padStart(2, '0')}`;
      const pastYearMonths = Array.from({ length: BEFORE_COUNT + 1 }, (_, i) => shiftYearMonth(anchorYm, i - BEFORE_COUNT));

      const pastResults = await Promise.all(
        pastYearMonths.map(async (yearMonth) => {
          const cached = cacheRef.current.get(yearMonth);
          if (cached) return { yearMonth, data: cached };
          try {
            const data = await getProfitLossByMonth(store.id, yearMonth, closingTime);
            cacheRef.current.set(yearMonth, data);
            return { yearMonth, data };
          } catch {
            return null;
          }
        })
      );

      const pastBars: TrendBar[] = pastResults
        .filter((r): r is { yearMonth: string; data: ProfitLoss } => r !== null)
        .map(r => ({ key: r.yearMonth, label: monthLabel(r.yearMonth), data: r.data, isCurrent: r.yearMonth === anchorYm }));

      // 선택한 달 이후라도 이미 지난 달(오늘 이전)이면 실제 데이터가 있으니 빈 막대로 두지 않고 조회한다
      const now = new Date();
      const realYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const afterYearMonths = Array.from({ length: AFTER_COUNT }, (_, i) => shiftYearMonth(anchorYm, i + 1));

      const futureResults = await Promise.all(
        afterYearMonths.map(async (yearMonth) => {
          if (yearMonth > realYearMonth) return { yearMonth, data: null }; // 아직 오지 않은 달만 빈 막대
          const cached = cacheRef.current.get(yearMonth);
          if (cached) return { yearMonth, data: cached };
          try {
            const data = await getProfitLossByMonth(store.id, yearMonth, closingTime);
            cacheRef.current.set(yearMonth, data);
            return { yearMonth, data };
          } catch {
            return { yearMonth, data: null };
          }
        })
      );

      const futureBars: TrendBar[] = futureResults.map(r => ({
        key: r.yearMonth, label: monthLabel(r.yearMonth), data: r.data, isCurrent: false,
      }));

      setBars([...pastBars, ...futureBars]);
    } finally {
      setLoading(false);
    }
  }, [store, anchorYear, anchorMonth]);

  return { bars, loading, refetch };
}
