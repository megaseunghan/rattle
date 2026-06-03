import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getProfitLossByMonth } from '../services/profitLoss';
import { ProfitLoss } from '../../types';

export function useProfitLoss(yearMonth: string) {
  const { store } = useAuth();
  const [data, setData] = useState<ProfitLoss | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      const closingTime = (store.closing_time as string | null | undefined)?.slice(0, 5) ?? '23:00';
      const result = await getProfitLossByMonth(store.id, yearMonth, closingTime);
      setData(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [store, yearMonth]);

  return { data, loading, error, refetch: fetch };
}
