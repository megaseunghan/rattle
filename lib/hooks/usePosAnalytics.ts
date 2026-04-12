import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getDailySummaries, getDailyItems } from '../services/posAnalytics';
import { DailySummary, DailyItem } from '../../types';

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
    loadMoreSummaries,
    fetchItems,
  };
}
