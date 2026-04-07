import { useState, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getDailySummaries, getDailyItems } from '../services/posAnalytics';
import { DailySummary, DailyItem } from '../../types';

export function usePosAnalytics() {
  const { store } = useAuth();
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [items, setItems] = useState<DailyItem[]>([]);
  const [loadingSummaries, setLoadingSummaries] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('전체');

  const fetchSummaries = useCallback(async (closingTime: string) => {
    if (!store) return;
    setLoadingSummaries(true);
    setError(null);
    try {
      const result = await getDailySummaries(store.id, closingTime);
      setSummaries(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingSummaries(false);
    }
  }, [store]);

  const fetchItems = useCallback(async (dateFrom: string, dateTo: string) => {
    if (!store) return;
    setLoadingItems(true);
    setItems([]); // 이전 데이터 초기화
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
    loadingItems,
    error,
    fetchSummaries,
    fetchItems,
  };
}
