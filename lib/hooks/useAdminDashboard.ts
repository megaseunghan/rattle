import { useCallback, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getMultiStoreMonthlyPnl, getMultiStoreYearlyPnl, StorePnl,
  getTodayCleaningProgress, CleaningProgress,
  getTodayAttendanceStatus, AttendanceStatus,
  getTodayScheduleSummary, TodayScheduleSummary,
} from '../services/adminDashboard';

export type DashboardPeriod = 'month' | 'year';

export interface StoreOps {
  storeId: string;
  cleaning: CleaningProgress;
  attendance: AttendanceStatus;
  schedule: TodayScheduleSummary;
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
  const [ops, setOps] = useState<Record<string, StoreOps>>({});
  const [loading, setLoading] = useState(false);

  const yearMonth = `${anchorYear}-${String(anchorMonth).padStart(2, '0')}`;
  const isCurrentMonth = anchorYear === now.getFullYear() && anchorMonth === now.getMonth() + 1;

  const refetch = useCallback(async () => {
    if (ownedStores.length === 0) return;
    setLoading(true);
    try {
      const [pnlResult, opsResults] = await Promise.all([
        period === 'month'
          ? getMultiStoreMonthlyPnl(ownedStores, yearMonth)
          : getMultiStoreYearlyPnl(ownedStores, anchorYear),
        Promise.all(ownedStores.map(async s => {
          const [cleaning, attendance, schedule] = await Promise.all([
            getTodayCleaningProgress(s.id),
            getTodayAttendanceStatus(s.id),
            getTodayScheduleSummary(s.id),
          ]);
          return { storeId: s.id, cleaning, attendance, schedule } as StoreOps;
        })),
      ]);
      setPnl(pnlResult);
      const opsMap: Record<string, StoreOps> = {};
      opsResults.forEach(o => { opsMap[o.storeId] = o; });
      setOps(opsMap);
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
    pnl, ops, loading, refetch, goPrev, goNext,
  };
}
