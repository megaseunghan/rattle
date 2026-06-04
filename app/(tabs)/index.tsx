import { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useProfitLoss } from '../../lib/hooks/useProfitLoss';
import { useFixedExpenseCheck } from '../../lib/hooks/useFixedExpenseCheck';
import { Ingredient, ProfitLoss } from '../../types';

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toLocaleString()}원`;
}

const SECTION_THEME = {
  revenue:  { icon: 'bar-chart'   as const, color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  purchase: { icon: 'cart'        as const, color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
  labor:    { icon: 'people'      as const, color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  expense:  { icon: 'wallet'      as const, color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
};

function PnLSection({
  theme, label, badge, value, sublabel, subs, loading, onPress,
}: {
  theme: keyof typeof SECTION_THEME;
  label: string;
  badge?: string;
  value: string;
  sublabel?: string;
  subs?: { label: string; value: string }[];
  loading: boolean;
  onPress: () => void;
}) {
  const t = SECTION_THEME[theme];
  const hasSubs = subs && subs.some(s => s.value !== '—' && s.value !== '0원');

  return (
    <TouchableOpacity
      style={[styles.section, { borderLeftColor: t.color, backgroundColor: t.bg, borderColor: t.border }]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={styles.sectionTop}>
        <View style={[styles.sectionIconBg, { backgroundColor: t.color + '20' }]}>
          <Ionicons name={t.icon} size={16} color={t.color} />
        </View>
        <View style={styles.sectionLeft}>
          <View style={styles.sectionLabelRow}>
            <Text style={[styles.sectionLabel, { color: t.color }]}>{label}</Text>
            {badge && <View style={[styles.badge, { backgroundColor: t.color + '18' }]}><Text style={[styles.badgeText, { color: t.color }]}>{badge}</Text></View>}
          </View>
          {sublabel && <Text style={styles.sectionSublabel}>{sublabel}</Text>}
        </View>
        <View style={styles.sectionRight}>
          {loading
            ? <ActivityIndicator size="small" color={t.color} />
            : <Text style={[styles.sectionValue, { color: t.color }]}>{value}</Text>
          }
          <Ionicons name="chevron-forward" size={14} color={t.color + '80'} style={{ marginTop: 2 }} />
        </View>
      </View>

      {hasSubs && !loading && (
        <View style={[styles.subList, { borderTopColor: t.border }]}>
          {subs!.filter(s => s.value !== '—' && s.value !== '0원').map((s, i) => (
            <View key={i} style={styles.subItem}>
              <View style={[styles.subDot, { backgroundColor: t.color + '60' }]} />
              <Text style={styles.subItemLabel}>{s.label}</Text>
              <Text style={[styles.subItemValue, { color: t.color }]}>{s.value}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

function GrossRow({ value, loading }: { value: string; loading: boolean }) {
  return (
    <View style={styles.grossRow}>
      <View style={styles.grossLeft}>
        <Ionicons name="remove-circle-outline" size={15} color={Colors.gray400} />
        <Text style={styles.grossLabel}>매출이익</Text>
      </View>
      {loading
        ? <ActivityIndicator size="small" color={Colors.gray300} />
        : <Text style={styles.grossValue}>{value}</Text>
      }
    </View>
  );
}

function ProfitRow({ value, loading }: { value: string | null; loading: boolean }) {
  const isNeg = value && value.startsWith('-');
  return (
    <View style={[styles.profitRow, isNeg ? styles.profitRowNeg : styles.profitRowPos]}>
      <View style={styles.profitLeft}>
        <Ionicons
          name={isNeg ? 'trending-down' : 'trending-up'}
          size={18}
          color={isNeg ? '#DC2626' : Colors.primary}
        />
        <Text style={[styles.profitLabel, isNeg ? styles.profitLabelNeg : styles.profitLabelPos]}>
          영업이익
        </Text>
      </View>
      {loading
        ? <ActivityIndicator size="small" color={Colors.primary} />
        : <Text style={[styles.profitValue, isNeg ? styles.profitValueNeg : styles.profitValuePos]}>
            {value ?? '—'}
          </Text>
      }
    </View>
  );
}

function PnLCard({ pnl, loading }: { pnl: ProfitLoss | null; loading: boolean }) {
  const cats = pnl?.purchaseByCategory ?? {};
  const catOrder = ['식자재', '비품', '소모품', '주류', '기타'] as const;

  const totalExpense = (pnl?.fixedExpense ?? 0) + (pnl?.variableExpense ?? 0);

  return (
    <View style={styles.pnlCard}>
      <PnLSection
        theme="revenue"
        label="매출"
        value={fmt(pnl?.revenue)}
        subs={[
          { label: '카드', value: fmt(pnl?.cardRevenue) },
          { label: '현금·계좌이체', value: fmt(pnl?.cashRevenue) },
        ]}
        loading={loading}
        onPress={() => router.push('/(tabs)/pos')}
      />

      <PnLSection
        theme="purchase"
        label="매입"
        value={fmt(pnl?.purchaseCost)}
        subs={catOrder.map(c => ({ label: c, value: fmt(cats[c]) }))}
        loading={loading}
        onPress={() => router.push('/(tabs)/purchases')}
      />

      <PnLSection
        theme="labor"
        label="인건비"
        value={fmt(pnl?.laborCost)}
        subs={[
          { label: '직원 인건비', value: fmt(pnl?.regularGross) },
          { label: '직원 원천징수', value: fmt(pnl?.regularWithholding) },
          { label: '파트타이머 인건비', value: fmt(pnl?.partTimeGross) },
          { label: '파트타이머 원천징수', value: fmt(pnl?.partTimeWithholding) },
        ]}
        loading={loading}
        onPress={() => router.push('/(tabs)/payroll')}
      />

      <PnLSection
        theme="expense"
        label="비용"
        value={fmt(totalExpense)}
        subs={[
          { label: '고정비', value: fmt(pnl?.fixedExpense) },
          { label: '마케팅', value: fmt(pnl?.marketingExpense) },
          { label: '시설보수', value: fmt(pnl?.maintenanceExpense) },
          { label: '공과금', value: fmt(pnl?.utilitiesExpense) },
        ]}
        loading={loading}
        onPress={() => router.push('/(tabs)/expenses')}
      />

      <ProfitRow value={fmt(pnl?.operatingProfit)} loading={loading} />
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
      <View style={[styles.stockBadge, isDanger ? styles.badgeDanger : styles.badgeWarn]}>
        <Text style={[styles.stockBadgeText, isDanger ? styles.badgeTextDanger : styles.badgeTextWarn]}>
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
  const { check: checkFixedExpense } = useFixedExpenseCheck();

  useFocusEffect(useCallback(() => {
    refetch();
    fetchPnl();
    checkFixedExpense();
  }, [refetch, fetchPnl, checkFixedExpense]));

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

        {/* 요약 카드 */}
        <View style={styles.metricRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>이번 달 매출</Text>
            {pnlLoading
              ? <ActivityIndicator size="small" color={Colors.gray300} style={styles.metricLoader} />
              : <Text style={styles.metricValue}>{fmt(pnl?.revenue)}</Text>
            }
            <Text style={styles.metricSub}>{!pnlLoading ? `카드 ${fmt(pnl?.cardRevenue)}` : ''}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>이번 달 영업이익</Text>
            {pnlLoading
              ? <ActivityIndicator size="small" color={Colors.gray300} style={styles.metricLoader} />
              : <Text style={[styles.metricValue, (pnl?.operatingProfit ?? 0) >= 0 ? styles.profitColor : styles.lossColor]}>
                  {fmt(pnl?.operatingProfit)}
                </Text>
            }
            <Text style={styles.metricSub}>{!pnlLoading ? `매입 ${fmt(pnl?.purchaseCost)}` : ''}</Text>
          </View>
        </View>

        {/* 손익계산서 */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionHeaderLabel}>이번 달 손익계산서</Text>
          <TouchableOpacity onPress={() => router.push('/profit-loss')} activeOpacity={0.7}>
            <Text style={styles.sectionLink}>연간 보기</Text>
          </TouchableOpacity>
        </View>
        <PnLCard pnl={pnl} loading={pnlLoading} />

        {/* 품절 임박 */}
        <Text style={styles.sectionHeaderLabel}>품절 임박</Text>
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
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  storePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.gray100, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, maxWidth: 210,
  },
  storePillText: { fontSize: 12, color: Colors.gray500 },
  scroll: { padding: 16, gap: 14, paddingBottom: 48 },

  metricRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 14,
    borderWidth: 0.5, borderColor: Colors.gray100, padding: 14,
  },
  metricLabel: { fontSize: 11, color: Colors.gray400, marginBottom: 4 },
  metricValue: { fontSize: 20, fontWeight: '700', color: Colors.black, marginBottom: 2 },
  metricLoader: { height: 28, marginBottom: 2 },
  metricSub: { fontSize: 11, color: Colors.gray400 },
  profitColor: { color: Colors.primary },
  lossColor: { color: '#DC2626' },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionHeaderLabel: {
    fontSize: 11, fontWeight: '600', color: Colors.gray400,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  sectionLink: { fontSize: 12, color: Colors.primary, fontWeight: '500' },

  // 손익 카드
  pnlCard: { gap: 6 },

  section: {
    borderRadius: 14, borderWidth: 1, borderLeftWidth: 3,
    overflow: 'hidden',
  },
  sectionTop: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
  },
  sectionIconBg: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  sectionLeft: { flex: 1 },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionLabel: { fontSize: 13, fontWeight: '700' },
  sectionSublabel: { fontSize: 11, color: Colors.gray400, marginTop: 2 },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionValue: { fontSize: 15, fontWeight: '700' },

  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '600' },

  subList: { borderTopWidth: 0.5, paddingHorizontal: 14, paddingVertical: 8, gap: 5 },
  subItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subDot: { width: 4, height: 4, borderRadius: 2 },
  subItemLabel: { flex: 1, fontSize: 12, color: Colors.gray500 },
  subItemValue: { fontSize: 12, fontWeight: '500' },

  // 매출이익 행
  grossRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Colors.white, borderRadius: 10,
    borderWidth: 0.5, borderColor: Colors.gray100,
  },
  grossLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grossLabel: { fontSize: 12, fontWeight: '500', color: Colors.gray500 },
  grossValue: { fontSize: 13, fontWeight: '600', color: Colors.black },

  // 영업이익 행
  profitRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 14, borderWidth: 1,
  },
  profitRowPos: { backgroundColor: Colors.tinted, borderColor: Colors.pale },
  profitRowNeg: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  profitLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profitLabel: { fontSize: 14, fontWeight: '700' },
  profitLabelPos: { color: Colors.deeper },
  profitLabelNeg: { color: '#991B1B' },
  profitValue: { fontSize: 18, fontWeight: '800' },
  profitValuePos: { color: Colors.primary },
  profitValueNeg: { color: '#DC2626' },

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
  stockBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeWarn: { backgroundColor: '#FAEEDA' },
  badgeDanger: { backgroundColor: '#FCEBEB' },
  stockBadgeText: { fontSize: 11, fontWeight: '600' },
  badgeTextWarn: { color: '#854F0B' },
  badgeTextDanger: { color: '#A32D2D' },
  emptyInCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, padding: 24,
  },
  emptyInCardText: { fontSize: 14, color: Colors.gray500 },
});
