import { useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors, glassTintForStore } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useIngredients } from '../../lib/hooks/useIngredients';
import { useProfitLoss } from '../../lib/hooks/useProfitLoss';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useFixedExpenseCheck } from '../../lib/hooks/useFixedExpenseCheck';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { useDismissedIntents } from '../../lib/hooks/useDismissedIntents';
import { AttendanceCalendar } from '../../lib/components/AttendanceCalendar';
import { IntentCard, IntentCardProps } from '../../lib/components/IntentCard';
import { GlassCard } from '../../lib/components/GlassCard';
import { getProfitSentiment } from '../../lib/utils/sentimentMessage';
import { ProfitLoss } from '../../types';

type HomeIntent = IntentCardProps & { id: string };

const LABOR_RATIO_TARGET = 30;       // 인건비율 목표(%)
const LOW_STOCK_INTENT_THRESHOLD = 3; // 의도 카드 노출 품절 임박 기준 개수
const MONTH_CLOSE_LEAD_DAYS = 3;      // 월 마감 D-N 리마인더

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
  return `${(value / total * 100).toFixed(2)}%`;
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

function PnLCard({ pnl, loading, tint }: { pnl: ProfitLoss | null; loading: boolean; tint?: string }) {
  const cats = pnl?.purchaseByCategory ?? {};
  const catOrder = ['식자재', '비품소모품', '주류', '기타'] as const;
  const rev = pnl?.revenue ?? 0;
  const totalExpense = (pnl?.fixedExpense ?? 0) + (pnl?.variableExpense ?? 0);
  const isProfit = (pnl?.operatingProfit ?? 0) >= 0;

  return (
    <GlassCard tint={tint} contentStyle={styles.pnlGlassContent}>

      {/* 매출 */}
      <PnLRow label="매출" value={fmt(pnl?.revenue)} onPress={() => router.push('/(tabs)/pos')} loading={loading} />
      <PnLSubRow label="카드" value={fmt(pnl?.cardRevenue)} ratio={pct(pnl?.cardRevenue, rev)} />
      <PnLSubRow label="현금·계좌이체" value={fmt(pnl?.cashRevenue)} ratio={pct(pnl?.cashRevenue, rev)} />

      <PnLDivider />

      {/* 매입 */}
      <PnLRow label="매입" value={fmt(pnl?.purchaseCost)} ratio={pct(pnl?.purchaseCost, rev)} onPress={() => router.push('/(tabs)/purchases')} loading={loading} />
      {catOrder.map(cat => (
        <PnLSubRow key={cat} label={cat} value={fmt(cats[cat] ?? 0)} ratio={pct(cats[cat] ?? 0, rev)} />
      ))}

      <PnLDivider />

      {/* 인건비 */}
      <PnLRow label="인건비" value={fmt(pnl?.laborCost)} ratio={pct(pnl?.laborCost, rev)} onPress={() => router.push('/(tabs)/payroll')} loading={loading} />
      <PnLSubRow label="직원 인건비" value={fmt(pnl?.regularGross)} ratio={pct(pnl?.regularGross, rev)} />
      <PnLSubRow label="직원 원천징수" value={fmt(pnl?.regularWithholding)} ratio={pct(pnl?.regularWithholding, rev)} />
      <PnLSubRow label="파트타이머 인건비" value={fmt(pnl?.partTimeGross)} ratio={pct(pnl?.partTimeGross, rev)} />
      <PnLSubRow label="파트타이머 원천징수" value={fmt(pnl?.partTimeWithholding)} ratio={pct(pnl?.partTimeWithholding, rev)} />

      <PnLDivider />

      {/* 비용 */}
      <PnLRow label="비용" value={fmt(totalExpense)} ratio={pct(totalExpense, rev)} onPress={() => router.push('/(tabs)/expenses')} loading={loading} />
      <PnLSubRow label="고정비" value={fmt(pnl?.fixedExpense)} ratio={pct(pnl?.fixedExpense, rev)} />
      <PnLSubRow label="마케팅" value={fmt(pnl?.marketingExpense)} ratio={pct(pnl?.marketingExpense, rev)} />
      <PnLSubRow label="시설보수" value={fmt(pnl?.maintenanceExpense)} ratio={pct(pnl?.maintenanceExpense, rev)} />
      <PnLSubRow label="공과금" value={fmt(pnl?.utilitiesExpense)} ratio={pct(pnl?.utilitiesExpense, rev)} />
      <PnLSubRow label="카드 수수료" value={fmt(pnl?.cardFeeExpense)} ratio={pct(pnl?.cardFeeExpense, rev)} />

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
    </GlassCard>
  );
}

const SENTIMENT_STYLE: Record<
  'positive' | 'neutral' | 'negative',
  { bg: string; fg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  positive: { bg: Colors.sentiment.positiveBg, fg: Colors.sentiment.positive, icon: 'trending-up-outline' },
  neutral: { bg: Colors.sentiment.neutralBg, fg: Colors.sentiment.neutral, icon: 'remove-outline' },
  negative: { bg: Colors.sentiment.negativeBg, fg: Colors.sentiment.negative, icon: 'trending-down-outline' },
};

function SentimentBanner({ pnl }: { pnl: ProfitLoss }) {
  const fb = getProfitSentiment(pnl.operatingProfit ?? 0, pnl.revenue ?? 0);
  const s = SENTIMENT_STYLE[fb.level];

  return (
    <View style={[styles.sentimentBanner, { backgroundColor: s.bg }]}>
      <Ionicons name={s.icon} size={18} color={s.fg} />
      <Text style={[styles.sentimentText, { color: s.fg }]}>{fb.message}</Text>
    </View>
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
  const { autoSyncOnForeground, autoSyncing, todaySales } = useTossSync();
  const { isDismissed, dismiss } = useDismissedIntents();

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

  const lowStockAll = ingredients.filter(i => i.current_stock <= i.min_stock);
  const monthLabel = today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' });

  // ── Intent-based Design: 상황별 의도 카드 산출 ──
  const todayStr = `${yearMonth}-${String(today.getDate()).padStart(2, '0')}`;
  const laborRatio = pnl && pnl.revenue > 0 ? (pnl.laborCost / pnl.revenue) * 100 : 0;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const daysToClose = daysInMonth - today.getDate();
  const tossConnected = !!store?.toss_merchant_id;

  const intents: HomeIntent[] = [];
  if (!isPartTime) {
    if (lowStockAll.length >= LOW_STOCK_INTENT_THRESHOLD) {
      intents.push({
        id: 'low-stock',
        tone: 'urgent',
        icon: 'cube-outline',
        title: '재고를 채워주세요',
        description: `품절 임박 품목이 ${lowStockAll.length}개 있어요. 매입을 등록할까요?`,
        actionLabel: '재고 확인',
        onAction: () => router.push('/(tabs)/stock'),
      });
    }
    if (laborRatio > LABOR_RATIO_TARGET) {
      intents.push({
        id: `labor-ratio:${yearMonth}`,
        tone: 'warning',
        icon: 'people-outline',
        title: '인건비율이 목표를 초과했어요',
        description: `이번 달 인건비율이 ${laborRatio.toFixed(1)}%예요 (목표 ${LABOR_RATIO_TARGET}%).`,
        actionLabel: '인건비 보기',
        onAction: () => router.push('/(tabs)/payroll'),
      });
    }
    if (tossConnected && todaySales === 0) {
      intents.push({
        id: `toss-sync:${todayStr}`,
        tone: 'info',
        icon: 'sync-outline',
        title: '오늘 매출을 불러올까요?',
        description: '오늘 매출 데이터가 아직 동기화되지 않았어요.',
        actionLabel: '지금 동기화',
        busy: autoSyncing,
        onAction: async () => { await autoSyncOnForeground(); fetchPnl(); },
      });
    }
    if (daysToClose <= MONTH_CLOSE_LEAD_DAYS) {
      intents.push({
        id: `month-close:${yearMonth}`,
        tone: 'info',
        icon: 'calendar-outline',
        title: '이번 달 손익 정산',
        description: `이번 달 마감이 D-${daysToClose}예요. 손익을 확인해주세요.`,
        actionLabel: '손익 정산',
        onAction: () => router.push('/profit-loss'),
      });
    }
  }
  const activeIntents = intents.filter(it => !isDismissed(it.id));

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

        {/* Intent-based Design: 상황별 의도 카드 (최상단 가로 스크롤) */}
        {activeIntents.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.intentScrollOuter}
            contentContainerStyle={styles.intentScroll}
          >
            {activeIntents.map(({ id, ...cardProps }) => (
              <IntentCard key={id} {...cardProps} onDismiss={() => dismiss(id)} />
            ))}
          </ScrollView>
        )}

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
            <PnLCard pnl={pnl} loading={pnlLoading} tint={glassTintForStore(store?.id)} />
            {/* Emotionally Aware: 손익 결과 감성 피드백 */}
            {pnl && !pnlLoading && <SentimentBanner pnl={pnl} />}
          </>
        )}

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

  intentScrollOuter: { marginHorizontal: -16 },
  intentScroll: { paddingHorizontal: 16, paddingVertical: 2 },

  sentimentBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, marginTop: -4,
  },
  sentimentText: { flex: 1, fontSize: 13, fontWeight: '600' },

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
  pnlGlassContent: { padding: 0 },
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
