import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getManualSalesByMonth, deleteManualSale } from '../services/manualSales';
import { ManualSale } from '../../types';

export function useManualSales(yearMonth: string) {
  const { store } = useAuth();
  const [sales, setSales] = useState<ManualSale[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      setSales(await getManualSalesByMonth(store.id, yearMonth));
    } finally {
      setLoading(false);
    }
  }, [store, yearMonth]);

  const remove = useCallback(async (id: string) => {
    await deleteManualSale(id);
    setSales(prev => prev.filter(s => s.id !== id));
  }, []);

  const total = sales.reduce((sum, s) => sum + Number(s.amount), 0);

  return { sales, loading, total, refetch, remove };
}
