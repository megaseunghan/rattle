import { isCancelledError } from '@tanstack/react-query';
import { getErrorMessage } from '../utils/error';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getDailySummaries, getDailySummariesByRange, getDailyItems, getAutoSyncRange } from '../services/posAnalytics';
import { queryClient, queryKeys, useQueryScope, isAccessDenied } from '../query';
import { DailySummary, DailyItem } from '../../types';

export { clearLegacyPosCache } from '../query/legacyPosCache';

const SUMMARY_PAGE_DAYS = 14;

export function usePosAnalytics(initialFrom?: Date, initialTo?: Date) {
  const { store, canReadFinancials } = useAuth();
  const scope = useQueryScope();
  const identity = `${scope}:${store?.id ?? ''}:${store?.closing_time ?? ''}`;
  const active = useRef(identity);
  active.current = identity;
  const summaryRequest = useRef(0);
  const itemRequest = useRef(0);
  const keyForRange = (from: Date, to: Date) => queryKeys.store(scope, store?.id ?? '', 'pos', 'summaries', store?.closing_time ?? '23:00', from.toISOString(), to.toISOString(), to.getTime() > Date.now() ? getAutoSyncRange(store?.closing_time ?? '23:00').from : null);
  const initialKey = initialFrom && initialTo ? keyForRange(initialFrom, initialTo) : null;
  const summaryRange = useRef('');
  const summaryKey = useRef(initialKey ? JSON.stringify(initialKey) : '');
  const loadedIdentity = useRef(identity);
  useEffect(() => {
    if (loadedIdentity.current === identity) return;
    loadedIdentity.current = identity;
    summaryRequest.current++; itemRequest.current++;
    setSummaries([]); setItems([]); setError(null); setSummaryPage(0);
    setLoadingSummaries(false); setLoadingMoreSummaries(false); setLoadingItems(false);
    setHasMoreSummaries(true); setActiveCategory('전체');
  }, [identity]);
  const [summaries, setSummaries] = useState<DailySummary[]>(() => initialKey ? queryClient.getQueryData<DailySummary[]>(initialKey) ?? [] : []);
  const [items, setItems] = useState<DailyItem[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [loadingMoreSummaries, setLoadingMoreSummaries] = useState(false);
  const [hasMoreSummaries, setHasMoreSummaries] = useState(true);
  const [summaryPage, setSummaryPage] = useState(0);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('전체');

  const fetchSummaries = useCallback(async (closingTime: string) => {
    if (!store || canReadFinancials === false) return;
    const request = ++summaryRequest.current;
    const valid = () => active.current === identity && request === summaryRequest.current;
    setLoadingSummaries(true);
    setSummaryPage(0);
    setHasMoreSummaries(true);
    setError(null);
    try {
      const result = await getDailySummaries(store.id, closingTime, SUMMARY_PAGE_DAYS, 0);
      if (!valid()) return;
      setSummaries(result);
      setHasMoreSummaries(result.length > 0);
    } catch (e: any) {
      if (valid()) setError(getErrorMessage(e));
    } finally {
      if (valid()) setLoadingSummaries(false);
    }
  }, [store, identity]);

  const loadMoreSummaries = useCallback(async (closingTime: string) => {
    if (!store || !hasMoreSummaries || loadingMoreSummaries) return;
    const request = summaryRequest.current;
    const valid = () => active.current === identity && request === summaryRequest.current;
    setLoadingMoreSummaries(true);
    try {
      const nextPage = summaryPage + 1;
      const result = await getDailySummaries(
        store.id,
        closingTime,
        SUMMARY_PAGE_DAYS,
        nextPage * SUMMARY_PAGE_DAYS
      );
      if (!valid()) return;
      setSummaries(prev => [...prev, ...result]);
      setSummaryPage(nextPage);
      setHasMoreSummaries(result.length > 0);
    } catch (e: any) {
      if (valid()) setError(getErrorMessage(e));
    } finally {
      if (valid()) setLoadingMoreSummaries(false);
    }
  }, [store, identity, summaryPage, hasMoreSummaries, loadingMoreSummaries]);

  const fetchSummariesByRange = useCallback(async (from: Date, to: Date, force = false) => {
    if (!store || canReadFinancials === false) return;
    const request = ++summaryRequest.current;
    const valid = () => active.current === identity && request === summaryRequest.current;
    const closingTime = store.closing_time ?? '23:00';
    // Callers pass fixed range boundaries; only the request cutoff follows the clock.
    const live = to.getTime() > Date.now();
    const businessDay = live ? getAutoSyncRange(closingTime).from : null;
    const key = queryKeys.store(scope, store.id, 'pos', 'summaries', closingTime, from.toISOString(), to.toISOString(), businessDay);
    const cached = isAccessDenied(queryClient.getQueryState(key)?.error) ? undefined : queryClient.getQueryData<DailySummary[]>(key);
    const range = `${identity}:${from.toISOString()}:${businessDay ?? ""}`;
    summaryKey.current = JSON.stringify(key);
    const sameRange = summaryRange.current === range;
    summaryRange.current = range;
    if (cached) setSummaries(cached);
    else if (!sameRange) setSummaries([]);
    setLoadingSummaries(true);
    setHasMoreSummaries(false); setError(null);
    try {
      const result = await queryClient.fetchQuery({ queryKey: key,
        queryFn: () => {
          const cutoff = new Date(Math.min(to.getTime(), Date.now()));
          return cutoff <= from ? Promise.resolve([]) : getDailySummariesByRange(store.id, closingTime, from, cutoff);
        },
        staleTime: force ? 0 : 30_000, gcTime: 900_000 });
      if (valid()) setSummaries(result);
    } catch (e) { if (!isCancelledError(e) && valid()) { if (isAccessDenied(e)) setSummaries([]); setError(getErrorMessage(e)); } }
    finally { if (valid()) setLoadingSummaries(false); }
  }, [store, scope, identity, canReadFinancials]);

  const fetchItems = useCallback(async (dateFrom: string, dateTo: string) => {
    if (!store || canReadFinancials === false) return;
    const request = ++itemRequest.current;
    const valid = () => active.current === identity && request === itemRequest.current;
    const key = queryKeys.store(scope, store.id, 'pos', 'items', store.closing_time, dateFrom, dateTo);
    const cached = queryClient.getQueryData<DailyItem[]>(key);
    setItems(cached ?? []); setLoadingItems(!cached); setError(null); setActiveCategory('전체');
    try {
      const result = await queryClient.fetchQuery({ queryKey: key,
        queryFn: () => getDailyItems(store.id, dateFrom, dateTo), staleTime: 30_000, gcTime: 900_000 });
      if (valid()) setItems(result);
    } catch (e) { if (!isCancelledError(e) && valid()) setError(getErrorMessage(e)); }
    finally { if (valid()) setLoadingItems(false); }
  }, [store, scope, identity, canReadFinancials]);

  const categories = useMemo(() => ['전체', ...Array.from(new Set(items.map(i => i.categoryName).filter(category => !!category && category !== '전체'))).sort()], [items]);

  const filteredItems = useMemo(() => activeCategory === '전체'
    ? items
    : items.filter(i => i.categoryName === activeCategory), [items, activeCategory]);

  const scopeVisible = canReadFinancials !== false && loadedIdentity.current === identity;
  const summaryDenied = initialKey && isAccessDenied(queryClient.getQueryState(initialKey)?.error);
  const visibleSummaries = initialKey && summaryKey.current !== JSON.stringify(initialKey)
    ? queryClient.getQueryData<DailySummary[]>(initialKey) ?? [] : summaries;
  return {
    summaries: scopeVisible && !summaryDenied ? visibleSummaries : [],
    items: scopeVisible ? filteredItems : [],
    allItems: scopeVisible ? items : [],
    categories,
    activeCategory,
    setActiveCategory,
    loadingSummaries,
    loadingMoreSummaries,
    hasMoreSummaries,
    loadingItems,
    error,
    fetchSummaries,
    fetchSummariesByRange,
    loadMoreSummaries,
    fetchItems,
  };
}
