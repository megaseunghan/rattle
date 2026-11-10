import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { financialSummaryOptions } from '../query/financial';
import { useQueryScope, queryClient, queryKeys, isAccessDenied } from '../query';
import { getHomeFinancialTimeline } from '../services/homeFinancialTimeline';
import { financialPeriod, type HomeFinancialCardData } from '../utils/homeFinancialCard';
export function useHomeFinancialCard(enabled: boolean) {
  const { store, user, currentRole, canReadFinancials } = useAuth();
  const scope = useQueryScope();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { if (!enabled) return; setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, [enabled]);
  const asOf = enabled && financialPeriod(now).date !== financialPeriod(new Date()).date ? new Date() : now;
  const period = financialPeriod(asOf), allowed = enabled && !!store && !!user && canReadFinancials;
  const summary = useQuery({ ...financialSummaryOptions(scope, store?.id ?? '', store?.closing_time ?? '23:00', period.month, currentRole === 'admin'), enabled: !!allowed }, queryClient);
  const timeline = useQuery({ queryKey: queryKeys.store(scope, store?.id ?? '', 'financial', 'home-daily', period.date, store?.closing_time, currentRole),
    queryFn: () => getHomeFinancialTimeline(store!.id, store!.closing_time ?? '23:00', asOf), enabled: !!allowed && currentRole === 'admin', staleTime: 30000 }, queryClient);
  const denied = isAccessDenied(summary.error) || (currentRole === 'admin' && isAccessDenied(timeline.error));
  const data: HomeFinancialCardData | null = allowed && !denied && summary.data ? {
    date: period.date, totals: { profit: summary.data.operatingProfit, revenue: summary.data.revenue, purchase: summary.data.purchaseCost, labor: summary.data.laborCost, expense: summary.data.fixedExpense + summary.data.variableExpense },
    current: currentRole === 'admin' ? timeline.data?.current ?? [] : [], previous: currentRole === 'admin' ? timeline.data?.previous ?? [] : [], hasRecords: null,
  } : null;
  const refetch = useCallback(async () => {
    if (!allowed) return;
    await Promise.all([summary.refetch(), ...(currentRole === 'admin' ? [timeline.refetch()] : [])]);
  }, [!!allowed, currentRole, summary.refetch, timeline.refetch]);
  return { data, loading: !!allowed && !data && summary.isPending, refreshing: !!allowed && !!data && (summary.isFetching || timeline.isFetching), error: !!allowed && (summary.isError || currentRole === 'admin' && timeline.isError), denied, refetch };
}
