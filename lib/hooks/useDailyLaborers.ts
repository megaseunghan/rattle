import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyLaborEntry, DailyLaborer, DailyLaborPayment } from '../../types';
import { getDailyLaborEntries, getDailyLaborPayments, getDailyLaborers } from '../services/dailyLaborers';
import { getErrorMessage } from '../utils/error';

/** 일용근로자 명단, 월 근무 기록과 연결된 지급 묶음. 매장·월이 바뀌면 이전 응답을 버린다. */
export function useDailyLaborers(storeId: string | undefined, yearMonth: string) {
  const [laborers, setLaborers] = useState<DailyLaborer[]>([]);
  const [entries, setEntries] = useState<DailyLaborEntry[]>([]);
  const [payments, setPayments] = useState<DailyLaborPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const current = ++generation.current;
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [nextLaborers, nextEntries] = await Promise.all([getDailyLaborers(storeId), getDailyLaborEntries(storeId, yearMonth)]);
      const nextPayments = await getDailyLaborPayments(storeId, nextEntries.flatMap(e => (e.payment_id ? [e.payment_id] : [])));
      if (current !== generation.current) return;
      setLaborers(nextLaborers);
      setEntries(nextEntries);
      setPayments(nextPayments);
    } catch (e) {
      if (current === generation.current) setError(getErrorMessage(e, '일용근로자 기록을 불러오지 못했어요.'));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [storeId, yearMonth]);

  useEffect(() => {
    setLaborers([]);
    setEntries([]);
    setPayments([]);
    void reload();
    return () => { generation.current++; };
  }, [reload]);

  return { laborers, entries, payments, loading, error, reload };
}
