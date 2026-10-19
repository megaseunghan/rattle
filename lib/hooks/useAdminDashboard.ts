import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getMultiStoreMonthlyPnl, getMultiStoreYearlyPnl, StorePnl,
  getMultiStoreMonthlyTrend, getMultiStoreYearlyTrend,
  getWeeklyCleaningProgress, WeeklyCleaningDay,
  getWeeklyScheduleBreakdown, WeeklyScheduleDay,
} from '../services/adminDashboard';

export type DashboardPeriod = 'month' | 'year';

export function useAdminDashboard() {
  const { user, stores, memberRoles } = useAuth();
  // 실제 owner_id 기준 오너 매장 + admin 역할로 참여 중인 매장까지 포함 (다매장 최고관리자 시나리오)
  const ownedStores = useMemo(() => stores.filter(s => s.owner_id === user?.id || memberRoles[s.id] === 'admin'), [stores, user?.id, memberRoles]);

  const now = new Date();
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [anchorYear, setAnchorYear] = useState(now.getFullYear());
  const [anchorMonth, setAnchorMonth] = useState(now.getMonth() + 1);

  const [pnl, setPnl] = useState<{ current: StorePnl[]; previous: StorePnl[] } | null>(null);
  const [trend, setTrend] = useState<{ label: string; value: number }[] | null>(null);
  const [weeklyCleaning, setWeeklyCleaning] = useState<Record<string, { days: WeeklyCleaningDay[]; pct: number }>>({});
  const [weeklySchedule, setWeeklySchedule] = useState<Record<string, WeeklyScheduleDay[]>>({});
  const [errors, setErrors] = useState<{ pnl: boolean; trend: boolean; cleaning: Record<string, boolean>; schedule: Record<string, boolean> }>({ pnl: false, trend: false, cleaning: {}, schedule: {} });
  const [loading, setLoading] = useState(false);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const requestId = useRef(0);

  const yearMonth = `${anchorYear}-${String(anchorMonth).padStart(2, '0')}`;
  const isCurrentMonth = anchorYear === now.getFullYear() && anchorMonth === now.getMonth() + 1;
  const storeIds = ownedStores.map(s => `${s.id}:${s.closing_time}`).join(',');
  const scopeKey = `${user?.id ?? ''}:${storeIds}:${period}:${yearMonth}`;
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  useEffect(() => () => { requestId.current += 1; }, []);

  const refetch = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const requestedScope = scopeKey;
    setLoadedScope(requestedScope);
    setPnl(null);
    setTrend(null);
    setWeeklyCleaning({});
    setWeeklySchedule({});
    setErrors({ pnl: false, trend: false, cleaning: {}, schedule: {} });
    if (ownedStores.length === 0) { setLoading(false); return; }
    setLoading(true);
    const [pnlResult, trendResult, weeklyCleaningResults, weeklyScheduleResults] = await Promise.allSettled([
        period === 'month'
          ? getMultiStoreMonthlyPnl(ownedStores, yearMonth)
          : getMultiStoreYearlyPnl(ownedStores, anchorYear),
        period === 'month'
          ? getMultiStoreMonthlyTrend(ownedStores, yearMonth)
          : getMultiStoreYearlyTrend(ownedStores, anchorYear),
        Promise.allSettled(ownedStores.map(s => getWeeklyCleaningProgress(s.id))),
        Promise.allSettled(ownedStores.map(s => getWeeklyScheduleBreakdown(s.id))),
    ] as const);
    if (currentRequest !== requestId.current || requestedScope !== scopeRef.current) return;
    setPnl(pnlResult.status === 'fulfilled' ? pnlResult.value : null);
    setTrend(trendResult.status === 'fulfilled' ? trendResult.value : null);
    const cleaningMap: Record<string, { days: WeeklyCleaningDay[]; pct: number }> = {};
    const scheduleMap: Record<string, WeeklyScheduleDay[]> = {};
    const cleaningErrors: Record<string, boolean> = {};
    const scheduleErrors: Record<string, boolean> = {};
    ownedStores.forEach((store, i) => {
      const cleaning = weeklyCleaningResults.status === 'fulfilled' ? weeklyCleaningResults.value[i] : undefined;
      const schedule = weeklyScheduleResults.status === 'fulfilled' ? weeklyScheduleResults.value[i] : undefined;
      if (cleaning?.status === 'fulfilled') cleaningMap[store.id] = cleaning.value;
      else cleaningErrors[store.id] = true;
      if (schedule?.status === 'fulfilled') scheduleMap[store.id] = schedule.value;
      else scheduleErrors[store.id] = true;
    });
    setWeeklyCleaning(cleaningMap);
    setWeeklySchedule(scheduleMap);
    setErrors({ pnl: pnlResult.status === 'rejected', trend: trendResult.status === 'rejected', cleaning: cleaningErrors, schedule: scheduleErrors });
    setLoading(false);
  }, [scopeKey, ownedStores, period, yearMonth, anchorYear]);

  function goPrev() {
    if (period === 'year') { setAnchorYear(y => y - 1); return; }
    if (anchorMonth === 1) { setAnchorYear(y => y - 1); setAnchorMonth(12); }
    else setAnchorMonth(m => m - 1);
  }

  function goNext() {
    if (period === 'year') { if (anchorYear < now.getFullYear()) setAnchorYear(y => y + 1); return; }
    if (isCurrentMonth) return;
    if (anchorMonth === 12) { setAnchorYear(y => y + 1); setAnchorMonth(1); }
    else setAnchorMonth(m => m + 1);
  }

  const visible = loadedScope === scopeKey;
  return {
    ownedStores, period, setPeriod, anchorYear, anchorMonth, yearMonth, isCurrentMonth,
    pnl: visible ? pnl : null,
    trend: visible ? trend : null,
    weeklyCleaning: visible ? weeklyCleaning : {},
    weeklySchedule: visible ? weeklySchedule : {},
    errors: visible ? errors : { pnl: false, trend: false, cleaning: {}, schedule: {} },
    loading: visible ? loading : ownedStores.length > 0,
    refetch, goPrev, goNext,
  };
}
