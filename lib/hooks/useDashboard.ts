import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabase';
import { getAutoSyncRange } from '../services/posAnalytics';

export interface EstimatedConsumption {
  ingredientName: string;
  amount: number;
  unit: string;
}

interface RecentActivity {
  id: string;
  type: 'order' | 'ingredient';
  label: string;
  created_at: string;
}

interface UseDashboardResult {
  monthlyOrderCount: number;
  lowStockCount: number;
  recipeCount: number;
  avgMarginRate: number;
  recentActivity: RecentActivity[];
  estimatedConsumptions: EstimatedConsumption[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDashboard(): UseDashboardResult {
  const { store } = useAuth();
  const [monthlyOrderCount, setMonthlyOrderCount] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [recipeCount, setRecipeCount] = useState(0);
  const [avgMarginRate, setAvgMarginRate] = useState(0);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [estimatedConsumptions, setEstimatedConsumptions] = useState<EstimatedConsumption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!store) return;
    setLoading(true);
    setError(null);
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [ordersRes, ingredientsRes, recipesRes, recentOrdersRes, recentIngredientsRes] =
        await Promise.all([
          // 이번 달 발주 건수
          supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('store_id', store.id)
            .gte('created_at', startOfMonth),

          // 모든 식자재 (품절 임박 계산용 - 컬럼 간 비교는 클라이언트에서)
          supabase
            .from('ingredients')
            .select('current_stock, min_stock')
            .eq('store_id', store.id),

          // 레시피 목록 (수 + 실시간 평균 마진율)
          supabase
            .from('recipes')
            .select('selling_price, recipe_ingredients(quantity, ingredient:ingredients(last_price, container_size))')
            .eq('store_id', store.id),

          // 최근 발주 5건
          supabase
            .from('orders')
            .select('id, supplier_name, created_at')
            .eq('store_id', store.id)
            .order('created_at', { ascending: false })
            .limit(5),

          // 최근 식자재 5건
          supabase
            .from('ingredients')
            .select('id, name, created_at')
            .eq('store_id', store.id)
            .order('created_at', { ascending: false })
            .limit(5),
        ]);

      // 이번 달 발주 건수
      setMonthlyOrderCount(ordersRes.count ?? 0);

      // 품절 임박: current_stock <= min_stock 클라이언트 계산
      const allIngredients = ingredientsRes.data ?? [];
      const lowStock = allIngredients.filter(
        (i: { current_stock: number; min_stock: number }) =>
          Number(i.current_stock) <= Number(i.min_stock)
      ).length;
      setLowStockCount(lowStock);

      // 레시피 수 + 실시간 평균 마진율
      const recipes = recipesRes.data ?? [];
      setRecipeCount(recipes.length);
      if (recipes.length > 0) {
        const marginRates = recipes.map((r: any) => {
          const cost = (r.recipe_ingredients ?? []).reduce((sum: number, ri: any) => {
            const base = ri.ingredient?.last_price ?? 0;
            const containerSize = ri.ingredient?.container_size;
            const unitPrice = containerSize && containerSize > 0 ? base / containerSize : base;
            return sum + ri.quantity * unitPrice;
          }, 0);
          return r.selling_price > 0 ? ((r.selling_price - cost) / r.selling_price) * 100 : 0;
        });
        const avg = marginRates.reduce((sum: number, m: number) => sum + m, 0) / marginRates.length;
        setAvgMarginRate(Math.round(avg * 10) / 10);
      } else {
        setAvgMarginRate(0);
      }

      // 최근 활동 병합 (발주 + 식자재, created_at 기준 최근 5건)
      const orderActivities: RecentActivity[] = (recentOrdersRes.data ?? []).map(
        (o: { id: string; supplier_name: string; created_at: string }) => ({
          id: o.id,
          type: 'order' as const,
          label: `발주: ${o.supplier_name}`,
          created_at: o.created_at,
        })
      );
      const ingredientActivities: RecentActivity[] = (recentIngredientsRes.data ?? []).map(
        (i: { id: string; name: string; created_at: string }) => ({
          id: i.id,
          type: 'ingredient' as const,
          label: `식자재 등록: ${i.name}`,
          created_at: i.created_at,
        })
      );
      const combined = [...orderActivities, ...ingredientActivities]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
      setRecentActivity(combined);

      // 예상 재고 소진량: 오늘 POS 판매 × 레시피 재료 구성
      const { from: todayFrom } = getAutoSyncRange(store.closing_time ?? '23:00');
      const todayItemsRes = await supabase
        .from('toss_order_items')
        .select('item_name, quantity, toss_orders!inner(order_at, status)')
        .eq('store_id', store.id)
        .eq('toss_orders.status', 'COMPLETED')
        .gte('toss_orders.order_at', todayFrom);

      const itemMap: Record<string, number> = {};
      for (const item of (todayItemsRes.data ?? []) as { item_name: string; quantity: number }[]) {
        itemMap[item.item_name] = (itemMap[item.item_name] ?? 0) + item.quantity;
      }

      if (Object.keys(itemMap).length > 0) {
        const matchedRecipes = await supabase
          .from('recipes')
          .select('name, recipe_ingredients(quantity, ingredient:ingredients(name, unit))')
          .eq('store_id', store.id)
          .in('name', Object.keys(itemMap));

        const consumptionMap: Record<string, { amount: number; unit: string }> = {};
        for (const recipe of (matchedRecipes.data ?? []) as any[]) {
          const soldQty = itemMap[recipe.name] ?? 0;
          for (const ri of recipe.recipe_ingredients ?? []) {
            const ingName = ri.ingredient?.name;
            if (!ingName) continue;
            const consumed = ri.quantity * soldQty;
            if (consumptionMap[ingName]) {
              consumptionMap[ingName].amount += consumed;
            } else {
              consumptionMap[ingName] = { amount: consumed, unit: ri.ingredient?.unit ?? '' };
            }
          }
        }

        setEstimatedConsumptions(
          Object.entries(consumptionMap)
            .sort((a, b) => b[1].amount - a[1].amount)
            .slice(0, 5)
            .map(([name, v]) => ({
              ingredientName: name,
              amount: Math.round(v.amount * 100) / 100,
              unit: v.unit,
            }))
        );
      } else {
        setEstimatedConsumptions([]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    monthlyOrderCount,
    lowStockCount,
    recipeCount,
    avgMarginRate,
    recentActivity,
    estimatedConsumptions,
    loading,
    error,
    refetch,
  };
}
