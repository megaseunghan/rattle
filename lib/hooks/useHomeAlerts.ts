import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';

/** 월마감 며칠 전부터 리마인더를 띄울지 */
const MONTH_CLOSE_LEAD_DAYS = 3;

export interface HomeAlert {
  key: 'fixedExpenseMissing' | 'tossNotSynced' | 'monthClose';
  message: string;
  actionLabel: string;
  route: string;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function useHomeAlerts() {
  const { store } = useAuth();
  const [fixedExpenseMissing, setFixedExpenseMissing] = useState(false);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    try {
      const today = new Date();
      const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const { data } = await supabase
        .from('expenses')
        .select('id')
        .eq('store_id', store.id)
        .eq('year_month', yearMonth)
        .eq('category', '고정비')
        .limit(1);
      setFixedExpenseMissing(!data || data.length === 0);
    } finally {
      setLoading(false);
    }
  }, [store?.id]);

  function buildAlerts(todaySales: number): HomeAlert[] {
    const alerts: HomeAlert[] = [];
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;

    if (fixedExpenseMissing) {
      alerts.push({
        key: 'fixedExpenseMissing',
        message: `${month}월 고정비가 아직 등록되지 않았어요`,
        actionLabel: '등록하기',
        route: '/expenses',
      });
    }

    if (store?.toss_merchant_id && todaySales === 0) {
      alerts.push({
        key: 'tossNotSynced',
        message: '오늘 토스 매출이 아직 동기화되지 않았어요',
        actionLabel: '동기화',
        route: '/settings/pos-sync',
      });
    }

    const daysLeft = daysInMonth(year, month) - today.getDate();
    if (daysLeft >= 0 && daysLeft <= MONTH_CLOSE_LEAD_DAYS) {
      alerts.push({
        key: 'monthClose',
        message: daysLeft === 0 ? '오늘이 월마감일이에요' : `월마감까지 ${daysLeft}일 남았어요`,
        actionLabel: '손익 확인',
        route: '/profit-loss',
      });
    }

    return alerts;
  }

  return { buildAlerts, refetch, loading };
}
