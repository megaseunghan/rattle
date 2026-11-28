/**
 * S04 홈 손익 칸 막대 자료. 월·연도는 서버 월 요약(get_financial_summaries_v2 묶음 조회)을 합치고,
 * 주는 관리자 일별 타임라인(기존 홈 손익 계산)을 주 단위로 더한다. 새 서버 집계는 만들지 않는다.
 * active가 false거나 고른 기간이 아니면 조회를 시작하지 않는다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { financialSummaryOptions } from '../query/financial';
import { STALE_TIME } from '../query/staleTimes';
import { isAccessDenied, queryClient, queryKeys, useQueryScope } from '../query';
import { getHomeFinancialTimeline } from '../services/homeFinancialTimeline';
import { financialPeriod, type HomeValues } from '../utils/homeFinancialCard';
import {
  dailyValues, monthBars, previousWeekSameDays, recentMonths, summaryValues, weekBars, yearBars, yearMonths,
  type PeriodBar, type ProfitPeriod,
} from '../components/home/profit/profitPeriods';

export const MONTH_BAR_COUNT = 6;
export const YEAR_BAR_COUNT = 3;
export const WEEK_BAR_COUNT = 8;

type Timeline = Awaited<ReturnType<typeof getHomeFinancialTimeline>>;
export interface HomeProfitData {
  bars: PeriodBar[];
  /** 진행 중 기간 비교: 같은 계산에서 나온 이번 값과 앞 기간 같은 날 값. 없으면 null. */
  sameDay: { now: HomeValues | null; base: HomeValues | null } | null;
  loading: boolean;
  error: boolean;
  denied: boolean;
  /** 이번 달 같은 날 비교 자료 상태(일별 계산). 월 막대에서만 loading/error가 될 수 있다. */
  comparisonState: 'loading' | 'error' | 'ready';
  refetch: () => Promise<void>;
}

function useToday(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

/** 지난달 마지막 순간(한국 시각). 이 시각 기준 타임라인은 지난달 전체와 그 전달 같은 날까지를 준다. */
function previousMonthEnd(month: string): Date {
  return new Date(Date.parse(`${month}-01T00:00:00+09:00`) - 1);
}

function useTimelines(currentEnabled: boolean, previousEnabled: boolean, asOf: Date) {
  const { store, canManageStore } = useAuth();
  const scope = useQueryScope();
  const period = financialPeriod(asOf);
  const closing = store?.closing_time ?? '23:00';
  const storeId = store?.id ?? '';
  const admin = !!store && canManageStore;
  const current = useQuery({
    queryKey: queryKeys.store(scope, storeId, 'financial', 'home-daily', period.date, store?.closing_time, canManageStore),
    queryFn: () => getHomeFinancialTimeline(storeId, closing, asOf), enabled: admin && currentEnabled, staleTime: STALE_TIME.financialCurrent,
  }, queryClient);
  const previousAsOf = previousMonthEnd(period.month);
  const previousDate = financialPeriod(previousAsOf).date;
  const previous = useQuery({
    queryKey: queryKeys.store(scope, storeId, 'financial', 'home-daily', previousDate, store?.closing_time, canManageStore),
    queryFn: () => getHomeFinancialTimeline(storeId, closing, previousAsOf), enabled: admin && previousEnabled, staleTime: STALE_TIME.financialPast,
  }, queryClient);
  return { current, previous, period, previousMonth: financialPeriod(previousAsOf) };
}

function weekData(today: string, month: string, previousMonth: { month: string; previousMonth: string }, now?: Timeline, before?: Timeline) {
  const daily = new Map<string, HomeValues>();
  const add = (map: Map<string, HomeValues>) => map.forEach((values, date) => daily.set(date, values));
  if (before) { add(dailyValues(previousMonth.previousMonth, before.previous)); add(dailyValues(previousMonth.month, before.current)); }
  if (now) add(dailyValues(month, now.current));
  const bars = weekBars(daily, today, WEEK_BAR_COUNT);
  return { bars, sameDay: { now: bars.at(-1)?.values ?? null, base: previousWeekSameDays(daily, today) } };
}

export function useHomeProfit(active: boolean, period: ProfitPeriod): HomeProfitData {
  const { store, user, canManageStore, canReadFinancials } = useAuth();
  const scope = useQueryScope();
  const asOf = useToday(active);
  const { month: currentMonth, date: today } = financialPeriod(asOf);
  const allowed = active && !!store && !!user && canReadFinancials;
  const months = useMemo(() => period === 'year' ? yearMonths(currentMonth, YEAR_BAR_COUNT) : recentMonths(currentMonth, MONTH_BAR_COUNT),
    [period, currentMonth]);
  const summaries = useQueries({
    queries: months.map(month => ({
      ...financialSummaryOptions(scope, store?.id ?? '', store?.closing_time ?? '23:00', month, canManageStore),
      enabled: allowed && period !== 'week',
    })),
  }, queryClient);
  // 진행 중인 달의 같은 날 비교와 주 막대는 같은 일별 계산(관리자 전용)에서 가져온다.
  const timelines = useTimelines(allowed && period !== 'year', allowed && period === 'week', asOf);
  const byMonth = useMemo(() => new Map(months.map((month, index) => {
    const data = summaries[index]?.data;
    return [month, data ? summaryValues(data) : undefined] as const;
  })), [months, summaries]);

  const result = useMemo(() => {
    if (period === 'week') return weekData(today, currentMonth, timelines.previousMonth, timelines.current.data, timelines.previous.data);
    const bars = period === 'year' ? yearBars(currentMonth, YEAR_BAR_COUNT, byMonth) : monthBars(months, byMonth, currentMonth);
    const daily = timelines.current.data;
    const sameDay = period === 'month' && daily
      ? { now: daily.current.at(-1)?.values ?? null, base: daily.previous.at(-1)?.values ?? null } : null;
    return { bars, sameDay };
  }, [period, today, currentMonth, months, byMonth, timelines.current.data, timelines.previous.data, timelines.previousMonth]);

  const weekQueries = [timelines.current, timelines.previous];
  const errors = period === 'week' ? weekQueries.map(query => query.error) : summaries.map(query => query.error);
  const denied = errors.some(isAccessDenied);
  const loading = allowed && (period === 'week'
    ? weekQueries.some(query => query.isPending && query.fetchStatus !== 'idle')
    : summaries.some(query => query.isPending && query.fetchStatus !== 'idle'));
  const refetchRef = useRef<() => Promise<void>>(async () => {});
  refetchRef.current = async () => {
    if (!allowed) return;
    const list = period === 'week' ? weekQueries : [...summaries, ...(period === 'month' && canManageStore ? [timelines.current] : [])];
    await Promise.all(list.map(query => query.refetch()));
  };
  const refetch = useMemo(() => () => refetchRef.current(), []);
  // 진행 중인 달의 같은 날 비교는 일별 계산이 와야 나온다. 기다리는 중·실패를 '자료 없음'과 구분한다.
  const comparisonState: 'loading' | 'error' | 'ready' = period !== 'month' ? 'ready'
    : timelines.current.isPending && timelines.current.fetchStatus !== 'idle' ? 'loading'
    : timelines.current.error ? 'error' : 'ready';
  return { ...result, loading, error: allowed && errors.some(Boolean), denied, comparisonState, refetch };
}
