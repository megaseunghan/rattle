import { createContext, useContext } from 'react';

export type TabName = 'home' | 'stock' | 'purchases' | 'payroll' | 'more';

interface TabPagerContextValue {
  activeTab: TabName;
  goToTab: (tab: TabName) => void;
}

export const TabPagerContext = createContext<TabPagerContextValue | null>(null);

export function useTabPager(): TabPagerContextValue {
  const ctx = useContext(TabPagerContext);
  if (!ctx) throw new Error('useTabPager must be used within TabPagerContext.Provider');
  return ctx;
}
