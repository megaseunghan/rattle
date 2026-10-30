import { createContext, useContext } from 'react';

export type TabName = 'home' | 'stock' | 'purchases' | 'payroll' | 'sales' | 'more';
export type HomeMode = 'dashboard' | 'store';

interface TabPagerContextValue {
  activeTab: TabName;
  goToTab: (tab: TabName) => void;
  /** 사장님 홈 탭 — 'dashboard'(통합 대시보드) / 'store'(선택한 매장의 일반 홈 화면) */
  homeMode: HomeMode;
  setHomeMode: (mode: HomeMode) => void;
  openStorePicker: (targetTab?: TabName) => void;
  selectStoreScope: (storeId: string, targetTab?: TabName) => Promise<void>;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  /** 확인할 일에서 진입한 뒤 완료 시 복원할 홈 범위. */
  returnScope?: 'all' | 'store';
  viewState?: Record<string, string>;
  setViewState?: (key: string, value: string) => void;
  employeeRegistration?: { storeId: string; id: number };
  consumeEmployeeRegistration?: () => void;
}

export const TabPagerContext = createContext<TabPagerContextValue | null>(null);

export function useTabPager(): TabPagerContextValue {
  const ctx = useContext(TabPagerContext);
  if (!ctx) throw new Error('useTabPager must be used within TabPagerContext.Provider');
  return ctx;
}
