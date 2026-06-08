import { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useProfitLoss } from '../../lib/hooks/useProfitLoss';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useFixedExpenseCheck } from '../../lib/hooks/useFixedExpenseCheck';
import { AttendanceCalendar } from '../../lib/components/AttendanceCalendar';
import { Ingredient, ProfitLoss } from '../../types';

type QuickAction = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; route: string };

const QUICK_ACTIONS: Record<'admin' | 'member' | 'part_time', QuickAction[]> = {
  admin: [
    { key: 'attendance', label: '출퇴근 관리', icon: 'time-outline',   route: '/attendance' },
    { key: 'employees',  label: '직원 관리',   icon: 'people-outline', route: '/(tabs)/payroll' },
    { key: 'purchases',  label: '매입 관리',   icon: 'cart-outline',   route: '/(tabs)/purchases' },
    { key: 'stock',      label: '재고/레시피', icon: 'cube-outline',   route: '/(tabs)/stock' },
  ],
  member: [
    { key: 'attendance', label: '출퇴근 관리',   icon: 'time-outline',   route: '/attendance' },
    { key: 'parttime',   label: '파트타이머 관리', icon: 'people-outline', route: '/(tabs)/payroll' },
    { key: 'purchases',  label: '매입 관리',     icon: 'cart-outline',   route: '/(tabs)/purchases' },
    { key: 'stock',      label: '재고/레시피',   icon: 'cube-outline',   route: '/(tabs)/stock' },
  ],
  part_time: [
    { key: 'attendance', label: '출퇴근 관리', icon: 'time-outline', route: '/attendance' },
    { key: 'stock',      label: '재고 관리',   icon: 'cube-outline', route: '/(tabs)/stock' },
  ],
};

function QuickActionsGrid({ actions }: { actions: QuickAction[] }) {
  return (
    <View style={styles.quickGrid}>
      {actions.map(a => (
        <TouchableOpacity
          key={a.key}
          style={styles.quickCard}
          activeOpacity={0.75}
          onPress={() => router.push(a.route as any)}
        >
          <View style={styles.quickIconWrap}>
            <Ionicons name={a.icon} size={22} color={Colors.primary} />
          </View>
          <Text style={styles.quickLabel}>{a.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toLocaleString()}원`;
}

function pct(value: number | null | undefined, total: number | null | undefined): string {
  if (!value || !total) return '';
  const p = Math.round((value / total) * 1000) / 10;
  return `${p}%`;
}

function PnLRow({ label, value, ratio, onPress, loading }: {
  label: string; value: string; ratio?: string; onPress?: () => void; loading?: boolean;
}) {
  const inner = (
    <View style={styles.pnlRow}>
      <View style={styles.pnlLabelRow}>
        <Text style={styles.pnlLabel}>{label}</Text>
        {ratio ? <Text style={styles.ratioTag}>{ratio}</Text> : null}
      </View>
      <View style={styles.pnlRight}>
        {loading
          ? <ActivityIndicator size="small" color={Colors.gray300} />
          : <Text style={styles.pnlValue}>{value}</Text>
        }
        {onPress && <Ionicons name="chevron-forward" size={13} color={Colors.gray300} />}
      </View>
    </View>
  );
  if (onPress) return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{inner}</TouchableOpacity>;
  return inner;
}

function PnLSubRow({ label, value, ratio }: { label: string; value: string; ratio?: string }) {
  return (
    <View style={styles.subRow}>
      <Text style={styles.subLabel}>{label}</Text>
      <View style={styles.subRight}>
        {ratio ? <Text style={styles.subRatio}>{ratio}</Text> : null}
        <Text style={styles.subValue}>{value}</Text>
      </View>
    </View>
  );
}

function PnLDivider() {
  return <View style={styles.pnlDivider} />;
}

function PnLCard({ pnl, loading }: { pnl: ProfitLoss | null; loading: boolean }) {
  const cats = pnl?.purchaseByCategory ?? {};
  const catOrder = ['식자재', '비품', '소모품', '주류', '기타'] as const;
  const rev = pnl?.revenue ?? 0;
  const totalExpense = (pnl?.fixedExpense ?? 0) + (pnl?.variableExpense ?? 0);
  const isProfit = (pnl?.operatingProfit ?? 0) >= 0;

  return (
    <View style={styles.pnlCard}>

      {/* 매출 */}
      <PnLRow label="매출" value={fmt(pnl?.revenue)} onPress={() => router.push('/(tabs)/pos')} loading={loading} />
      <PnLSubRow label="카드" value={fmt(pnl?.cardRevenue)} ratio={pct(pnl?.cardRevenue, rev)} />
      <PnLSubRow label="현금·계좌이체" value={fmt(pnl?.cashRevenue)} ratio={pct(pnl?.cashRevenue, rev)} />

      <PnLDivider />

      {/* 매입 */}
      <PnLRow label="매입" value={fmt(pnl?.purchaseCost)} ratio={pct(pnl?.purchaseCost, rev)} onPress={() => router.push('/(tabs)/purchases')} loading={loading} />
      {catOrder.map(cat => (
        <PnLSubRow key={cat} label={cat} value={fmt(cats[cat] ?? 0)} ratio={pct(cats[cat] ?? 0, pnl?.purchaseCost)} />
      ))}

      <PnLDivider />

      {/* 인건비 */}
      <PnLRow label="인건비" value={fmt(pnl?.laborCost)} ratio={pct(pnl?.laborCost, rev)} onPress={() => router.push('/(tabs)/payroll')} loading={loading} />
      <PnLSubRow label="직원 인건비" value={fmt(pnl?.regularGross)} ratio={pct(pnl?.regularGross, pnl?.laborCost)} />
      <PnLSubRow label="직원 원천징수" value={fmt(pnl?.regularWithholding)} ratio={pct(pnl?.regularWithholding, pnl?.laborCost)} />
      <PnLSubRow label="파트타이머 인건비" value={fmt(pnl?.partTimeGross)} ratio={pct(pnl?.partTimeGross, pnl?.laborCost)} />
      <PnLSubRow label="파트타이머 원천징수" value={fmt(pnl?.partTimeWithholding)} ratio={pct(pnl?.partTimeWithholding, pnl?.laborCost)} />

      <PnLDivider />

      {/* 비용 */}
      <PnLRow label="비용" value={fmt(totalExpense)} ratio={pct(totalExpense, rev)} onPress={() => router.push('/(tabs)/expenses')} loading={loading} />
      <PnLSubRow label="고정비" value={fmt(pnl?.fixedExpense)} ratio={pct(pnl?.fixedExpense, totalExpense)} />
      <PnLSubRow label="마케팅" value={fmt(pnl?.marketingExpense)} ratio={pct(pnl?.marketingExpense, totalExpense)} />
      <PnLSubRow label="시설보수" value={fmt(pnl?.maintenanceExpense)} ratio={pct(pnl?.maintenanceExpense, totalExpense)} />
      <PnLSubRow label="공과금" value={fmt(pnl?.utilitiesExpense)} ratio={pct(pnl?.utilitiesExpense, totalExpense)} />

      {/* 영업이익 */}
      <View style={[styles.profitRow, isProfit ? styles.profitRowPos : styles.profitRowNeg]}>
        <View style={styles.profitLabelRow}>
          <Text style={[styles.profitLabel, isProfit ? styles.profitLabelPos : styles.profitLabelNeg]}>영업이익</Text>
          {rev > 0 && <Text style={[styles.profitRatio, isProfit ? styles.profitRatioPos : styles.profitRatioNeg]}>{pct(pnl?.operatingProfit, rev)}</Text>}
        </View>
        {loading
          ? <ActivityIndicator size="small" color={Colors.primary} />
          : <Text style={[styles.profitValue, isProfit ? styles.profitValuePos : styles.profitValueNeg]}>
              {fmt(pnl?.operatingProfit)}
            </Text>
        }
      </View>
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
  const { store, user, currentRole } = useAuth();
  const { data: ingredients, refetch } = useIngredients();
  const { employees, refetch: refetchEmp } = useEmployees();

  const today = new Date();
  const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const { data: pnl, loading: pnlLoading, refetch: fetchPnl } = useProfitLoss(yearMonth);
  const { check: checkFixedExpense } = useFixedExpenseCheck();

  // 로그인 본인에 연결된 직원 → 파트타이머 여부 판별
  const myEmployee = employees.find(e => e.user_id === user?.id);
  const effectiveRole: 'admin' | 'member' | 'part_time' =
    currentRole === 'admin' ? 'admin'
    : myEmployee?.employment_type === 'part_time' ? 'part_time'
    : 'member';
  const isPartTime = effectiveRole === 'part_time';

  useFocusEffect(useCallback(() => {
    refetch();
    refetchEmp();
    if (!isPartTime) {
      fetchPnl();
      checkFixedExpense();
    }
  }, [refetch, refetchEmp, fetchPnl, checkFixedExpense, isPartTime]));

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

        {/* 역할별 빠른 메뉴 */}
        <QuickActionsGrid actions={QUICK_ACTIONS[effectiveRole]} />

        {/* 파트타이머: 개인 출퇴근·급여 캘린더 / 그 외: 손익계산서 */}
        {isPartTime ? (
          store && myEmployee ? (
            <>
              <Text style={styles.sectionHeaderLabel}>내 출퇴근 · 급여</Text>
              <AttendanceCalendar storeId={store.id} employeeId={myEmployee.id} />
            </>
          ) : null
        ) : (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionHeaderLabel}>이번 달 손익계산서</Text>
              <TouchableOpacity onPress={() => router.push('/profit-loss')} activeOpacity={0.7}>
                <Text style={styles.sectionLink}>연간 보기</Text>
              </TouchableOpacity>
            </View>
            <PnLCard pnl={pnl} loading={pnlLoading} />
          </>
        )}

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

  profitColor: { color: Colors.primary },
  lossColor: { color: '#DC2626' },

  // 빠른 메뉴 그리드
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: {
    flexBasis: '47%', flexGrow: 1,
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 0.5, borderColor: Colors.gray100,
    paddingVertical: 18, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  quickIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.tinted, justifyContent: 'center', alignItems: 'center',
  },
  quickLabel: { fontSize: 14, fontWeight: '600', color: Colors.black, flexShrink: 1 },

  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionHeaderLabel: {
    fontSize: 11, fontWeight: '600', color: Colors.gray400,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  sectionLink: { fontSize: 12, color: Colors.primary, fontWeight: '500' },

  // 손익 카드
  pnlCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 0.5, borderColor: Colors.gray100,
    overflow: 'hidden',
  },
  pnlRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 11,
  },
  pnlLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pnlLabel: { fontSize: 14, fontWeight: '600', color: Colors.black },
  ratioTag: { fontSize: 11, color: Colors.gray400, fontWeight: '400' },
  pnlRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pnlValue: { fontSize: 14, fontWeight: '600', color: Colors.black },

  subRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 28, paddingVertical: 5,
  },
  subLabel: { fontSize: 12, color: Colors.gray400, flex: 1 },
  subRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subRatio: { fontSize: 11, color: Colors.gray300 },
  subValue: { fontSize: 12, color: Colors.gray500 },

  pnlDivider: { height: 0.5, backgroundColor: Colors.gray100, marginHorizontal: 16, marginVertical: 4 },

  profitRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    marginTop: 4,
  },
  profitRowPos: { backgroundColor: Colors.tinted },
  profitRowNeg: { backgroundColor: '#FEF2F2' },
  profitLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profitLabel: { fontSize: 14, fontWeight: '700' },
  profitLabelPos: { color: Colors.deeper },
  profitLabelNeg: { color: '#991B1B' },
  profitRatio: { fontSize: 12, fontWeight: '500' },
  profitRatioPos: { color: Colors.primary + 'AA' },
  profitRatioNeg: { color: '#DC2626AA' },
  profitValue: { fontSize: 17, fontWeight: '800' },
  profitValuePos: { color: Colors.primary },
  profitValueNeg: { color: '#DC2626' },

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
