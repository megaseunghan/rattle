import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { queryClient, queryKeys, useQueryScope, isAccessDenied } from '../query';
import { getErrorMessage } from '../utils/error';
import { useAuth } from '../contexts/AuthContext';
import {
  getMultiStoreMonthlyPnl, getMultiStoreYearlyPnl, StorePnl,
  getMultiStoreMonthlyTrend, getMultiStoreYearlyTrend,
  getWeeklyCleaningProgress, WeeklyCleaningDay,
  getWeeklyScheduleBreakdown, WeeklyScheduleDay,
} from '../services/adminDashboard';

export type DashboardPeriod = 'month' | 'year';

export function useAdminDashboard(sharedMonth?: string, onMonthChange?: (month: string) => void, focusedStoreId?: string | null) {
  const { user, stores, canViewOwnerDashboard, devPreviewMode } = useAuth();
  const ownedStores = useMemo(() => canViewOwnerDashboard && devPreviewMode === 'self'
    ? stores.filter(s => s.owner_id === user?.id) : [], [stores, user?.id, canViewOwnerDashboard, devPreviewMode]);

  const now = new Date();
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [localYear, setLocalYear] = useState(now.getFullYear());
  const [localMonth, setLocalMonth] = useState(now.getMonth() + 1);
  const [sharedYear, sharedMonthNumber] = (sharedMonth ?? '').split('-').map(Number);
  const anchorYear = sharedYear || localYear;
  const anchorMonth = sharedMonthNumber || localMonth;
  function setAnchor(year: number, month: number) {
    setLocalYear(year); setLocalMonth(month);
    onMonthChange?.(`${year}-${String(month).padStart(2, '0')}`);
  }

  const yearMonth = `${anchorYear}-${String(anchorMonth).padStart(2, '0')}`;
  const isCurrentMonth = anchorYear === now.getFullYear() && anchorMonth === now.getMonth() + 1;
  const identity = useQueryScope();
  const storeScope = ownedStores.map(s => `${s.id}:${s.closing_time}`).sort().join(',');
  const trendStores = focusedStoreId && ownedStores.some(store => store.id === focusedStoreId) ? ownedStores.filter(store => store.id === focusedStoreId) : ownedStores;
  const trendScope = trendStores.map(store => `${store.id}:${store.closing_time}`).sort().join(',');
  const summaryMeta = { storeIds: ownedStores.map(s => s.id) };
  const enabled = !!user && ownedStores.length > 0;
  const pnlQuery = useQuery({
    queryKey: ['rattle', identity, 'integrated', 'financial', storeScope, period, yearMonth, 'pnl'],
    queryFn: () => period === 'month' ? getMultiStoreMonthlyPnl(ownedStores, yearMonth, identity) : getMultiStoreYearlyPnl(ownedStores, anchorYear, identity),
    meta: summaryMeta, enabled,
  }, queryClient);
  const trendQuery = useQuery({
    queryKey: ['rattle', identity, 'integrated', 'financial', trendScope, period, yearMonth, 'trend'],
    queryFn: () => period === 'month' ? getMultiStoreMonthlyTrend(trendStores, yearMonth, 6, identity) : getMultiStoreYearlyTrend(trendStores, anchorYear, 6, identity),
    meta: summaryMeta, enabled,
  }, queryClient);
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const operationsStores = focusedStoreId === undefined ? ownedStores : ownedStores.filter(store => store.id === focusedStoreId);
  const cleaningQueries = useQueries({ queries: operationsStores.map(store => ({
    queryKey: queryKeys.store(identity, store.id, 'cleaning', today),
    queryFn: () => getWeeklyCleaningProgress(store.id), enabled,
  })) }, queryClient);
  const scheduleQueries = useQueries({ queries: operationsStores.map(store => ({
    queryKey: queryKeys.store(identity, store.id, 'schedule', today),
    queryFn: () => getWeeklyScheduleBreakdown(store.id), enabled,
  })) }, queryClient);
  const weeklyCleaning: Record<string, { days: WeeklyCleaningDay[]; pct: number }> = {};
  const weeklySchedule: Record<string, WeeklyScheduleDay[]> = {};
  const errors = { pnl: pnlQuery.isError, trend: trendQuery.isError, cleaning: {} as Record<string, boolean>, schedule: {} as Record<string, boolean> };
  operationsStores.forEach((store, i) => {
    if (cleaningQueries[i].data) weeklyCleaning[store.id] = cleaningQueries[i].data!;
    if (scheduleQueries[i].data) weeklySchedule[store.id] = scheduleQueries[i].data!;
    if (cleaningQueries[i].isError) errors.cleaning[store.id] = true;
    if (scheduleQueries[i].isError) errors.schedule[store.id] = true;
  });
  const refetch = useCallback(async () => {
    if (!enabled) return;
    // Invalidate/cancel underlying summaries before observers request their replacement.
    const filters = { predicate: (query: { queryKey: readonly unknown[] }) =>
      query.queryKey[0] === 'rattle' && query.queryKey[1] === identity && query.queryKey[3] === 'financial' };
    await queryClient.cancelQueries(filters);
    await queryClient.invalidateQueries({ ...filters, refetchType: 'none' });
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ['rattle', identity, 'integrated', 'financial'], type: 'active' }),
      ...operationsStores.flatMap(store => ['cleaning', 'schedule'].map(domain => queryClient.refetchQueries({ queryKey: queryKeys.store(identity, store.id, domain, today) }))),
    ]);
  }, [enabled, identity, storeScope, focusedStoreId, period, yearMonth, today]);

  function goPrev() {
    if (period === 'year') { setAnchor(anchorYear - 1, anchorMonth); return; }
    if (anchorMonth === 1) setAnchor(anchorYear - 1, 12);
    else setAnchor(anchorYear, anchorMonth - 1);
  }

  function goNext() {
    if (period === 'year') { if (anchorYear < now.getFullYear()) setAnchor(anchorYear + 1, anchorMonth); return; }
    if (isCurrentMonth) return;
    if (anchorMonth === 12) setAnchor(anchorYear + 1, 1);
    else setAnchor(anchorYear, anchorMonth + 1);
  }

  return {
    ownedStores, period, setPeriod, anchorYear, anchorMonth, yearMonth, isCurrentMonth,
    pnl: !enabled || isAccessDenied(pnlQuery.error) ? null : pnlQuery.data ?? null,
    trend: !enabled || isAccessDenied(trendQuery.error) ? null : trendQuery.data ?? null,
    financialError: pnlQuery.error ? getErrorMessage(pnlQuery.error, '손익을 불러오지 못했어요. 다시 확인해주세요.') : null,
    weeklyCleaning, weeklySchedule, errors,
    loading: enabled && (pnlQuery.isFetching || trendQuery.isFetching || cleaningQueries.some(q => q.isFetching) || scheduleQueries.some(q => q.isFetching)),
    refetch, goPrev, goNext,
  };
}
