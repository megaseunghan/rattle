import { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useProfitLoss } from '../../lib/hooks/useProfitLoss';
import { Ingredient, ProfitLoss } from '../../types';

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toLocaleString()}원`;
}

function fmtSigned(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toLocaleString()}원`;
}

// 대분류 행
function PnLGroup({ label, value, isPositive, loading, children, defaultOpen = false }: {
  label: string; value: string; isPositive?: boolean; loading?: boolean;
  children?: React.ReactNode; defaultOpen?: boolean;
}) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupLabel}>{label}</Text>
        {loading
          ? <ActivityIndicator size="small" color={Colors.gray300} />
          : <Text style={[styles.groupValue, isPositive === true && styles.valuePositive, isPositive === false && styles.valueNegative]}>
              {value}
            </Text>
        }
      </View>
      {children && <View style={styles.subRows}>{children}</View>}
    </View>
  );
}

// 소분류 행
function PnLSub({ label, value, loading }: { label: string; value: string; loading?: boolean }) {
  return (
    <View style={styles.subRow}>
      <Text style={styles.subLabel}>{label}</Text>
      {loading
        ? <ActivityIndicator size="small" color={Colors.gray300} />
        : <Text style={styles.subValue}>{value}</Text>
      }
    </View>
  );
}

// 구분선 합계 행
function PnLTotal({ label, value, isProfit, loading }: {
  label: string; value: string; isProfit?: boolean; loading?: boolean;
}) {
  return (
    <View style={[styles.totalRow, isProfit && styles.totalRowProfit]}>
      <Text style={[styles.totalLabel, isProfit && styles.totalLabelProfit]}>{label}</Text>
      {loading
        ? <ActivityIndicator size="small" color={Colors.gray300} />
        : <Text style={[styles.totalValue, isProfit && styles.totalValueProfit]}>{value}</Text>
      }
    </View>
  );
}

function PnLCard({ pnl, loading }: { pnl: ProfitLoss | null; loading: boolean }) {
  const cats = pnl?.purchaseByCategory ?? {};
  const catOrder = ['식자재', '비품', '소모품', '주류', '기타'] as const;

  return (
    <View style={styles.pnlCard}>
      {/* 1. 매출 */}
      <PnLGroup label="매출" value={fmt(pnl?.revenue)} loading={loading}>
        <PnLSub label="카드" value={fmt(pnl?.cardRevenue)} loading={loading} />
        <PnLSub label="현금·계좌이체" value={fmt(pnl?.cashRevenue)} loading={loading} />
      </PnLGroup>

      <View style={styles.divider} />

      {/* 2. 매입 */}
      <PnLGroup label="(-) 매입" value={fmt(pnl?.purchaseCost)} loading={loading}>
        {catOrder.map(cat => {
          const v = cats[cat];
          if (!v) return null;
          return <PnLSub key={cat} label={cat} value={fmt(v)} loading={loading} />;
        })}
      </PnLGroup>

      {/* = 매출이익 */}
      <PnLTotal label="= 매출이익" value={fmt(pnl?.grossProfit)} loading={loading} />

      <View style={styles.divider} />

      {/* 3. 인건비 */}
      <PnLGroup label="(-) 인건비" value={fmt(pnl?.laborCost)} loading={loading}>
        {(pnl?.regularGross ?? 0) > 0 && <>
          <PnLSub label="직원 인건비" value={fmt(pnl?.regularGross)} loading={loading} />
          <PnLSub label="직원 원천징수" value={fmt(pnl?.regularWithholding)} loading={loading} />
        </>}
        {(pnl?.partTimeGross ?? 0) > 0 && <>
          <PnLSub label="파트타이머 인건비" value={fmt(pnl?.partTimeGross)} loading={loading} />
          <PnLSub label="파트타이머 원천징수" value={fmt(pnl?.partTimeWithholding)} loading={loading} />
        </>}
      </PnLGroup>

      <View style={styles.divider} />

      {/* 4. 비용 */}
      <PnLGroup label="(-) 비용" value={fmt((pnl?.fixedExpense ?? 0) + (pnl?.variableExpense ?? 0))} loading={loading}>
        {(pnl?.fixedExpense ?? 0) > 0 &&
          <PnLSub label="고정비" value={fmt(pnl?.fixedExpense)} loading={loading} />}
        {(pnl?.marketingExpense ?? 0) > 0 &&
          <PnLSub label="마케팅" value={fmt(pnl?.marketingExpense)} loading={loading} />}
        {(pnl?.maintenanceExpense ?? 0) > 0 &&
          <PnLSub label="시설보수" value={fmt(pnl?.maintenanceExpense)} loading={loading} />}
        {(pnl?.utilitiesExpense ?? 0) > 0 &&
          <PnLSub label="공과금" value={fmt(pnl?.utilitiesExpense)} loading={loading} />}
      </PnLGroup>

      {/* 5. 영업이익 */}
      <PnLTotal
        label="= 영업이익"
        value={fmt(pnl?.operatingProfit)}
        isProfit
        loading={loading}
      />
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

        {/* 요약 카드 2개 */}
        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>이번 달 매출</Text>
            {pnlLoading
              ? <ActivityIndicator size="small" color={Colors.gray300} style={styles.metricLoader} />
              : <Text style={styles.metricValue}>{fmt(pnl?.revenue)}</Text>
            }
            <Text style={styles.metricSub}>{pnlLoading ? '' : `카드 ${fmt(pnl?.cardRevenue)}`}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>이번 달 영업이익</Text>
            {pnlLoading
              ? <ActivityIndicator size="small" color={Colors.gray300} style={styles.metricLoader} />
              : <Text style={[styles.metricValue, (pnl?.operatingProfit ?? 0) >= 0 && styles.valuePositive]}>
                  {fmt(pnl?.operatingProfit)}
                </Text>
            }
            <Text style={styles.metricSub}>매입 {pnlLoading ? '' : fmt(pnl?.purchaseCost)}</Text>
          </View>
        </View>

        {/* 손익계산서 */}
        <Text style={styles.sectionLabel}>이번 달 손익계산서</Text>
        <PnLCard pnl={pnl} loading={pnlLoading} />

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

  // 요약 카드
  metricRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.gray100, padding: 14,
  },
  metricLabel: { fontSize: 11, color: Colors.gray400, marginBottom: 4 },
  metricValue: { fontSize: 20, fontWeight: '600', color: Colors.black, marginBottom: 2 },
  metricLoader: { height: 28, justifyContent: 'center', marginBottom: 2 },
  metricSub: { fontSize: 11, color: Colors.gray400 },

  sectionLabel: {
    fontSize: 11, fontWeight: '500', color: Colors.gray400,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // 손익계산서 카드
  pnlCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 0.5, borderColor: Colors.gray100,
    overflow: 'hidden',
  },
  divider: { height: 0.5, backgroundColor: Colors.gray100, marginHorizontal: 16 },

  // 대분류
  group: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  groupLabel: { fontSize: 13, fontWeight: '600', color: Colors.black },
  groupValue: { fontSize: 13, fontWeight: '600', color: Colors.black },

  // 소분류
  subRows: { paddingLeft: 12, gap: 2, marginBottom: 4 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  subLabel: { fontSize: 12, color: Colors.gray500 },
  subValue: { fontSize: 12, color: Colors.gray600 },

  // 합계 행
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.gray50,
    borderTopWidth: 0.5, borderTopColor: Colors.gray100,
  },
  totalRowProfit: { backgroundColor: Colors.tinted },
  totalLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600 },
  totalLabelProfit: { color: Colors.deeper },
  totalValue: { fontSize: 14, fontWeight: '700', color: Colors.gray700 },
  totalValueProfit: { color: Colors.primary, fontSize: 15 },

  valuePositive: { color: Colors.primary },
  valueNegative: { color: '#D94040' },

  // 품절 임박
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
