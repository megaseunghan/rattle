import { createContext, useContext } from 'react';

export type TabName = 'home' | 'stock' | 'purchases' | 'payroll' | 'sales' | 'more';
export type HomeMode = 'dashboard' | 'store';

interface TabPagerContextValue {
  activeTab: TabName;
  goToTab: (tab: TabName) => void;
  /** 사장님 홈 탭 — 'dashboard'(통합 대시보드) / 'store'(선택한 매장의 일반 홈 화면) */
  homeMode: HomeMode;
  setHomeMode: (mode: HomeMode) => void;
}

export const TabPagerContext = createContext<TabPagerContextValue | null>(null);

export function useTabPager(): TabPagerContextValue {
  const ctx = useContext(TabPagerContext);
  if (!ctx) throw new Error('useTabPager must be used within TabPagerContext.Provider');
  return ctx;
}
