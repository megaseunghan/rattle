import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getMonthlyRevenue } from '../services/profitLoss';

export interface RevenueTrend {
  vsPrevMonth: number | null; // % 증감, 전월 매출 0/데이터없음이면 null
  vsLastYear: number | null;  // % 증감, 전년 동월 매출 0/데이터없음이면 null
}

function shiftYearMonth(yearMonth: string, monthsDelta: number): string {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const d = new Date(year, month - 1 + monthsDelta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function pctChange(current: number, prev: number): number | null {
  if (!prev) return null;
  return ((current - prev) / prev) * 100;
}

export function useRevenueTrend(yearMonth: string) {
  const { store } = useAuth();
  const [data, setData] = useState<RevenueTrend | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (currentRevenue: number) => {
    if (!store) return;
    setLoading(true);
    try {
      const closingTime = (store.closing_time as string | null | undefined)?.slice(0, 5) ?? '23:00';
      const [prevMonthRevenue, lastYearRevenue] = await Promise.all([
        getMonthlyRevenue(store.id, shiftYearMonth(yearMonth, -1), closingTime),
        getMonthlyRevenue(store.id, shiftYearMonth(yearMonth, -12), closingTime),
      ]);
      setData({
        vsPrevMonth: pctChange(currentRevenue, prevMonthRevenue),
        vsLastYear: pctChange(currentRevenue, lastYearRevenue),
      });
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [store, yearMonth]);

  return { data, loading, refetch: fetch };
}
