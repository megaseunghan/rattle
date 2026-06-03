import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { getDailySummaries, getDailySummariesByRange, getDailyItems } from '../services/posAnalytics';
import { DailySummary, DailyItem } from '../../types';

function summariesCacheKey(storeId: string, to: Date): string {
  // to에서 1초를 빼서 해당 월 내 날짜로 만든 뒤 year/month 추출
  const d = new Date(to.getTime() - 1000);
  return `pos_summaries_${storeId}_${d.getFullYear()}_${d.getMonth() + 1}`;
}

const SUMMARY_PAGE_DAYS = 14;

export function usePosAnalytics() {
  const { store } = useAuth();
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [items, setItems] = useState<DailyItem[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [loadingMoreSummaries, setLoadingMoreSummaries] = useState(false);
  const [hasMoreSummaries, setHasMoreSummaries] = useState(true);
  const [summaryPage, setSummaryPage] = useState(0);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('전체');

  const fetchSummaries = useCallback(async (closingTime: string) => {
    if (!store) return;
    setLoadingSummaries(true);
    setSummaryPage(0);
    setHasMoreSummaries(true);
    setError(null);
    try {
      const result = await getDailySummaries(store.id, closingTime, SUMMARY_PAGE_DAYS, 0);
      setSummaries(result);
      setHasMoreSummaries(result.length > 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingSummaries(false);
    }
  }, [store]);

  const loadMoreSummaries = useCallback(async (closingTime: string) => {
    if (!store || !hasMoreSummaries || loadingMoreSummaries) return;
    setLoadingMoreSummaries(true);
    try {
      const nextPage = summaryPage + 1;
      const result = await getDailySummaries(
        store.id,
        closingTime,
        SUMMARY_PAGE_DAYS,
        nextPage * SUMMARY_PAGE_DAYS
      );
      setSummaries(prev => [...prev, ...result]);
      setSummaryPage(nextPage);
      setHasMoreSummaries(result.length > 0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingMoreSummaries(false);
    }
  }, [store, summaryPage, hasMoreSummaries, loadingMoreSummaries]);

  const fetchSummariesByRange = useCallback(async (from: Date, to: Date) => {
    if (!store) return;
    setHasMoreSummaries(false);
    setError(null);

    // 캐시 확인 → 있으면 즉시 표시 (로딩 없음)
    const key = summariesCacheKey(store.id, to);
    try {
      const cached = await AsyncStorage.getItem(key);
      if (cached) {
        setSummaries(JSON.parse(cached));
        setLoadingSummaries(false);
      } else {
        setLoadingSummaries(true);
      }
    } catch {
      setLoadingSummaries(true);
    }

    // 백그라운드에서 DB 재조회 후 업데이트
    try {
      const closingTime = (store as any).closing_time?.slice(0, 5) ?? '23:00';
      const result = await getDailySummariesByRange(store.id, closingTime, from, to);
      setSummaries(result);
      await AsyncStorage.setItem(key, JSON.stringify(result));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingSummaries(false);
    }
  }, [store]);

  const fetchItems = useCallback(async (dateFrom: string, dateTo: string) => {
    if (!store) return;
    setLoadingItems(true);
    setItems([]);
    setError(null);
    setActiveCategory('전체');
    try {
      const result = await getDailyItems(store.id, dateFrom, dateTo);
      setItems(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingItems(false);
    }
  }, [store]);

  const categories = ['전체', ...Array.from(new Set(items.map(i => i.categoryName).filter(Boolean))).sort()];

  const filteredItems = activeCategory === '전체'
    ? items
    : items.filter(i => i.categoryName === activeCategory);

  return {
    summaries,
    items: filteredItems,
    allItems: items,
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
