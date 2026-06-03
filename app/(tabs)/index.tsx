import { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useProfitLoss } from '../../lib/hooks/useProfitLoss';
import { Ingredient } from '../../types';

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toLocaleString()}원`;
}

function MetricCard({ label, value, sub, positive, loading }: {
  label: string; value: string; sub: string; positive?: boolean; loading?: boolean;
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      {loading
        ? <ActivityIndicator size="small" color={Colors.gray300} style={styles.metricLoader} />
        : <Text style={[styles.metricValue, positive && styles.metricValuePositive]}>{value}</Text>
      }
      <Text style={styles.metricSub}>{sub}</Text>
    </View>
  );
}

function PnLRow({ label, value, isTotal, loading }: {
  label: string; value: string; isTotal?: boolean; loading?: boolean;
}) {
  return (
    <View style={[styles.pnlRow, isTotal && styles.pnlRowLast]}>
      <Text style={[styles.pnlLabel, isTotal && styles.pnlLabelBold]}>{label}</Text>
      {loading
        ? <ActivityIndicator size="small" color={Colors.gray300} />
        : <Text style={[styles.pnlValue, isTotal && styles.pnlValuePositive]}>{value}</Text>
      }
    </View>
  );
}

function LowStockRow({ item, isLast }: { item: Ingredient; isLast: boolean }) {
  const ratio = item.min_stock > 0 ? item.current_stock / item.min_stock : 1;
  const isDanger = ratio <= 0.2;
  return (
    <TouchableOpacity
      style={[styles.listItem, !isLast && styles.listItemBorder]}
      onPress={() => router.push(`/stock/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, { backgroundColor: isDanger ? '#FCEBEB' : '#FAEEDA' }]}>
        <Ionicons name="cube-outline" size={18} color={isDanger ? '#A32D2D' : '#854F0B'} />
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.itemSub}>잔여 {item.current_stock}{item.unit}</Text>
      </View>
      <View style={[styles.badge, isDanger ? styles.badgeDanger : styles.badgeWarn]}>
        <Text style={[styles.badgeText, isDanger ? styles.badgeTextDanger : styles.badgeTextWarn]}>
          {isDanger ? '부족' : '임박'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const { store } = useAuth();
  const { data: ingredients, refetch } = useIngredients();

  const today = new Date();
  const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const { data: pnl, loading: pnlLoading, refetch: fetchPnl } = useProfitLoss(yearMonth);

  useFocusEffect(useCallback(() => {
    refetch();
    fetchPnl();
  }, [refetch, fetchPnl]));

  const lowStockItems = ingredients.filter(i => i.current_stock <= i.min_stock).slice(0, 5);
  const monthLabel = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>오늘의 현황</Text>
        <View style={styles.storePill}>
          <Ionicons name="business-outline" size={12} color={Colors.gray500} />
          <Text style={styles.storePillText} numberOfLines={1}>
            {store?.name ?? ''} · {monthLabel}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* 2×2 메트릭 */}
        <View style={styles.metricGrid}>
          <MetricCard
            label="이번 달 매출"
            value={pnlLoading ? '' : fmt(pnl?.revenue)}
            sub={pnlLoading ? '불러오는 중...' : pnl ? `매입 ${fmt(pnl.purchaseCost)}` : 'TossPos 연동 후 표시'}
            loading={pnlLoading}
          />
          <MetricCard
            label="이번 달 손익"
            value={pnlLoading ? '' : fmt(pnl?.operatingProfit)}
            sub={pnlLoading ? '불러오는 중...' : pnl ? '영업이익 기준' : '준비 중'}
            positive={(pnl?.operatingProfit ?? 0) >= 0}
            loading={pnlLoading}
          />
          <MetricCard
            label="매입 (이번 달)"
            value={pnlLoading ? '' : fmt(pnl?.purchaseCost)}
            sub={pnlLoading ? '' : '식자재·비품·소모품'}
            loading={pnlLoading}
          />
          <MetricCard
            label="비용 (이번 달)"
            value={pnlLoading ? '' : fmt(pnl ? pnl.fixedExpense + pnl.variableExpense : null)}
            sub={pnlLoading ? '' : '고정비 + 변동비'}
            loading={pnlLoading}
          />
        </View>

        {/* 이번 달 손익 요약 */}
        <Text style={styles.sectionLabel}>이번 달 손익 요약</Text>
        <View style={styles.pnlCard}>
          <PnLRow label="총 매출액"       value={fmt(pnl?.revenue)}          loading={pnlLoading} />
          <PnLRow label="(-) 매출원가"    value={fmt(pnl?.purchaseCost)}     loading={pnlLoading} />
          <PnLRow label="= 매출이익"      value={fmt(pnl?.grossProfit)}      loading={pnlLoading} />
          <PnLRow label="(-) 인건비"      value={pnl?.laborCost === 0 ? '미입력' : fmt(pnl?.laborCost)} loading={pnlLoading} />
          <PnLRow label="(-) 고정비"      value={fmt(pnl?.fixedExpense)}     loading={pnlLoading} />
          <PnLRow label="(-) 공과금·변동비" value={fmt(pnl?.variableExpense)} loading={pnlLoading} />
          <PnLRow label="= 영업이익"      value={fmt(pnl?.operatingProfit)}  loading={pnlLoading} isTotal />
        </View>

        {/* 품절 임박 */}
        <Text style={styles.sectionLabel}>품절 임박</Text>
        <View style={styles.card}>
          {lowStockItems.length === 0 ? (
            <View style={styles.emptyInCard}>
              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.success} />
              <Text style={styles.emptyInCardText}>품절 임박 재고가 없어요</Text>
            </View>
          ) : (
            lowStockItems.map((item, i) => (
              <LowStockRow key={item.id} item={item} isLast={i === lowStockItems.length - 1} />
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  title: { fontSize: 17, fontWeight: '600', color: Colors.black },
  storePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.gray100, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, maxWidth: 210,
  },
  storePillText: { fontSize: 12, color: Colors.gray500 },
  scroll: { padding: 16, gap: 14, paddingBottom: 48 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metricCard: {
    width: '47.5%', backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.gray100, padding: 14,
  },
  metricLabel: { fontSize: 11, color: Colors.gray400, marginBottom: 4 },
  metricValue: { fontSize: 22, fontWeight: '600', color: Colors.black, marginBottom: 2 },
  metricValuePositive: { color: Colors.primary },
  metricLoader: { height: 28, justifyContent: 'center', marginBottom: 2 },
  metricSub: { fontSize: 11, color: Colors.gray400 },
  sectionLabel: {
    fontSize: 11, fontWeight: '500', color: Colors.gray400,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  pnlCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 0.5, borderColor: Colors.gray100, paddingHorizontal: 16,
  },
  pnlRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  pnlRowLast: { borderBottomWidth: 0 },
  pnlLabel: { fontSize: 13, color: Colors.gray500 },
  pnlLabelBold: { fontSize: 14, fontWeight: '600', color: Colors.black },
  pnlValue: { fontSize: 13, color: Colors.black },
  pnlValuePositive: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  card: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100 },
  listItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 12,
  },
  listItemBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '500', color: Colors.black },
  itemSub: { fontSize: 11, color: Colors.gray400, marginTop: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeWarn: { backgroundColor: '#FAEEDA' },
  badgeDanger: { backgroundColor: '#FCEBEB' },
  badgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextWarn: { color: '#854F0B' },
  badgeTextDanger: { color: '#A32D2D' },
  emptyInCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 24,
  },
  emptyInCardText: { fontSize: 14, color: Colors.gray500 },
});
