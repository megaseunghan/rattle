import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';

/**
 * 현재 매장의 품절 임박(is_low_stock=true) 재고 개수.
 * 하단 탭 배지("재고 (2)")용 — 생성 컬럼 기반 HEAD count로 페이지네이션과 무관하게 정확하다.
 */
export function useLowStockCount(): { count: number; refetch: () => Promise<void> } {
  const { store } = useAuth();
  const [count, setCount] = useState(0);

  const refetch = useCallback(async () => {
    if (!store) {
      setCount(0);
      return;
    }
    const { count: c, error } = await supabase
      .from('ingredients')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', store.id)
      .eq('is_low_stock', true);
    if (!error) setCount(c ?? 0);
  }, [store]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { count, refetch };
}
