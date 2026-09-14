import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getMultiStoreMonthlyPnl, getMultiStoreYearlyPnl, StorePnl,
  getMultiStoreMonthlyTrend, getMultiStoreYearlyTrend,
  getTodayAttendanceStatus, AttendanceStatus,
  getWeeklyCleaningProgress, WeeklyCleaningDay,
  getWeeklyScheduleBreakdown, WeeklyScheduleDay,
} from '../services/adminDashboard';

export type DashboardPeriod = 'month' | 'year';

export interface StoreOps {
  storeId: string;
  attendance: AttendanceStatus;
}

export function useAdminDashboard() {
  const { user, stores, memberRoles } = useAuth();
  // 실제 owner_id 기준 오너 매장 + admin 역할로 참여 중인 매장까지 포함 (다매장 최고관리자 시나리오)
  const ownedStores = stores.filter(s => s.owner_id === user?.id || memberRoles[s.id] === 'admin');

  const now = new Date();
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [anchorYear, setAnchorYear] = useState(now.getFullYear());
  const [anchorMonth, setAnchorMonth] = useState(now.getMonth() + 1);

  const [pnl, setPnl] = useState<{ current: StorePnl[]; previous: StorePnl[] }>({ current: [], previous: [] });
  const [trend, setTrend] = useState<{ label: string; value: number }[]>([]);
  const [ops, setOps] = useState<Record<string, StoreOps>>({});
  const [weeklyCleaning, setWeeklyCleaning] = useState<Record<string, { days: WeeklyCleaningDay[]; pct: number }>>({});
  const [weeklySchedule, setWeeklySchedule] = useState<Record<string, WeeklyScheduleDay[]>>({});
  const [loading, setLoading] = useState(false);

  const yearMonth = `${anchorYear}-${String(anchorMonth).padStart(2, '0')}`;
  const isCurrentMonth = anchorYear === now.getFullYear() && anchorMonth === now.getMonth() + 1;

  const refetch = useCallback(async () => {
    if (ownedStores.length === 0) return;
    setLoading(true);
    try {
      const [pnlResult, trendResult, opsResults, weeklyCleaningResults, weeklyScheduleResults] = await Promise.all([
        period === 'month'
          ? getMultiStoreMonthlyPnl(ownedStores, yearMonth)
          : getMultiStoreYearlyPnl(ownedStores, anchorYear),
        period === 'month'
          ? getMultiStoreMonthlyTrend(ownedStores, yearMonth)
          : getMultiStoreYearlyTrend(ownedStores, anchorYear),
        Promise.all(ownedStores.map(async s => ({ storeId: s.id, attendance: await getTodayAttendanceStatus(s.id) } as StoreOps))),
        Promise.all(ownedStores.map(async s => ({ storeId: s.id, result: await getWeeklyCleaningProgress(s.id) }))),
        Promise.all(ownedStores.map(async s => ({ storeId: s.id, days: await getWeeklyScheduleBreakdown(s.id) }))),
      ]);
      setPnl(pnlResult);
      setTrend(trendResult);
      const opsMap: Record<string, StoreOps> = {};
      opsResults.forEach(o => { opsMap[o.storeId] = o; });
      setOps(opsMap);
      const weeklyCleaningMap: Record<string, { days: WeeklyCleaningDay[]; pct: number }> = {};
      weeklyCleaningResults.forEach(r => { weeklyCleaningMap[r.storeId] = r.result; });
      setWeeklyCleaning(weeklyCleaningMap);
      const weeklyScheduleMap: Record<string, WeeklyScheduleDay[]> = {};
      weeklyScheduleResults.forEach(r => { weeklyScheduleMap[r.storeId] = r.days; });
      setWeeklySchedule(weeklyScheduleMap);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownedStores.map(s => s.id).join(','), period, yearMonth, anchorYear]);

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

  return {
    ownedStores, period, setPeriod, anchorYear, anchorMonth, yearMonth, isCurrentMonth,
    pnl, trend, ops, weeklyCleaning, weeklySchedule, loading, refetch, goPrev, goNext,
  };
}
