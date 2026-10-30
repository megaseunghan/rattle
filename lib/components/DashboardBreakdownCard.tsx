import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useDashboardBreakdown } from '../hooks/useDashboardBreakdown';
import { METRIC_LABELS, DashboardMetric } from '../services/dashboardBreakdown';
import { NumericText } from './ui/NumericText';
import { Colors } from '../../constants/colors';
import type { Store } from '../../types';
export function DashboardBreakdownCard({ stores, period, yearMonth, metric, expectedTotal, onClose, onRefresh }: {
  stores: Store[]; period: 'month' | 'year'; yearMonth: string; metric: DashboardMetric; expectedTotal: number | null; onClose: () => void; onRefresh: () => Promise<void>;
}) {
  const [grouping, setGrouping] = useState<'category' | 'supplier'>('category');
  const [refreshError, setRefreshError] = useState(false);
  const [page, setPage] = useState(0);
  const query = useDashboardBreakdown(stores, period, yearMonth, metric);
  const rows = (grouping === 'supplier' ? query.data?.suppliers : query.data?.rows) ?? [];
  const lastPage = Math.max(0, Math.ceil(rows.length / 4) - 1), currentPage = Math.min(page, lastPage);
  const mismatch = query.data?.total != null && expectedTotal != null && Math.round(query.data.total) !== Math.round(expectedTotal);
  async function refresh() {
    setRefreshError(false);
    try { await onRefresh(); await query.refetch({ throwOnError: true }); }
    catch { setRefreshError(true); }
  }
  return <View style={styles.card}>
    <View style={styles.heading}><Text style={styles.title}>{METRIC_LABELS[metric]} 세부 구성</Text><Pressable accessibilityRole="button" accessibilityLabel="세부 구성 닫기" onPress={onClose} style={styles.action}><Text style={styles.actionText}>닫기</Text></Pressable></View>
    {refreshError && <Text accessibilityRole="alert" style={styles.hint}>새로고침하지 못했어요. 다시 시도해주세요.</Text>}
    {metric === 'purchase' && <View style={styles.tabs}>{([['category', '분류별'], ['supplier', '거래처별']] as const).map(([key, label]) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: grouping === key }} onPress={() => { setGrouping(key); setPage(0); }} style={[styles.tab, grouping === key && styles.selectedTab]}><Text style={{ color: grouping === key ? Colors.action : Colors.gray500, fontWeight: '600' }}>{label}</Text></Pressable>)}</View>}
    {query.isPending ? <View style={styles.loading}><ActivityIndicator color={Colors.primary} /><Text style={styles.hint}>세부 내역을 불러오고 있어요</Text></View> : query.isError ? <><Text style={styles.hint}>세부 내역을 불러오지 못했어요</Text><Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.action}><Text style={styles.actionText}>다시 불러오기</Text></Pressable></> : <>
      {rows.length === 0 ? <Text style={styles.hint}>등록된 내역이 없어요</Text> : rows.slice(currentPage * 4, currentPage * 4 + 4).map(row => <View key={row.label} style={styles.row}><Text style={styles.label}>{row.label}</Text><NumericText style={styles.amount}>{row.amount == null ? '확인 필요' : `${Math.round(row.amount).toLocaleString('ko-KR')}원`}</NumericText></View>)}
      <View style={styles.row}><Text style={styles.label}>합계</Text><NumericText style={styles.amount}>{query.data?.total == null ? '확인 필요' : `${Math.round(query.data.total).toLocaleString('ko-KR')}원`}</NumericText></View>
      {mismatch && <View><Text style={styles.hint}>상세 합계 {Math.round(query.data!.total!).toLocaleString('ko-KR')}원 · 요약과 차이가 있어요</Text><Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.action}><Text style={styles.actionText}>자료 새로고침</Text></Pressable></View>}
      {lastPage > 0 && <View style={styles.pages}><Pressable accessibilityRole="button" accessibilityLabel="이전 세부 항목" disabled={currentPage === 0} onPress={() => setPage(currentPage - 1)} style={styles.action}><Text style={{ color: currentPage === 0 ? Colors.gray300 : Colors.action }}>이전</Text></Pressable><Text style={styles.hint}>{currentPage + 1} / {lastPage + 1}</Text><Pressable accessibilityRole="button" accessibilityLabel="다음 세부 항목" disabled={currentPage === lastPage} onPress={() => setPage(currentPage + 1)} style={styles.action}><Text style={{ color: currentPage === lastPage ? Colors.gray300 : Colors.action }}>다음</Text></Pressable></View>}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  card: { width: '100%', backgroundColor: Colors.tinted, borderRadius: 16, padding: 14, gap: 4 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 15, fontWeight: '700', color: Colors.black },
  tabs: { flexDirection: 'row', backgroundColor: Colors.gray100, borderRadius: 10, padding: 3, marginBottom: 8 }, tab: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 8 }, selectedTab: { backgroundColor: Colors.white },
  row: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Colors.homeBorder }, label: { flex: 1, fontSize: 13, color: Colors.gray600 }, amount: { fontSize: 14, fontWeight: '700', color: Colors.black, flexShrink: 1 },
  action: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }, actionText: { fontSize: 13, color: Colors.action, fontWeight: '600' }, hint: { fontSize: 12, color: Colors.gray500, lineHeight: 18 }, loading: { minHeight: 70, justifyContent: 'center', alignItems: 'center', gap: 8 }, pages: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
});
