import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { callOcrEdgeFunction } from '../../lib/services/ocr';
import { getErrorMessage } from '../../lib/utils/error';
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/colors';
import { CardStyle } from '../../constants/designTokens';
import { usePurchases } from '../../lib/hooks/usePurchases';
import { useExpenses } from '../../lib/hooks/useExpenses';
import { getPurchaseItemCounts } from '../../lib/services/purchases';
import { animateListChange } from '../../lib/utils/layoutAnimation';
import { ExpensesPanel } from '../../lib/components/ExpensesPanel';
import { usePurchaseTypes } from '../../lib/hooks/usePurchaseTypes';
import { Badge, SummaryCard } from '../../lib/components/ui';

// ─── 공통 ──────────────────────────────────────────────────
type PurchaseTab = string;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = Array(firstDay).fill(null);
  for (let i = 1; i <= lastDate; i++) days.push(i);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function toYearMonth(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function MonthNav({ year, month, onPrev, onNext }: { year: number; month: number; onPrev: () => void; onNext: () => void }) {
  return (
    <View style={styles.monthNav}>
      <TouchableOpacity onPress={onPrev} style={styles.navBtn} activeOpacity={0.7}>
        <Ionicons name="chevron-back" size={20} color={Colors.gray600} />
      </TouchableOpacity>
      <Text style={styles.monthLabel}>{year}년 {month + 1}월</Text>
      <TouchableOpacity onPress={onNext} style={styles.navBtn} activeOpacity={0.7}>
        <Ionicons name="chevron-forward" size={20} color={Colors.gray600} />
      </TouchableOpacity>
    </View>
  );
}

// ─── 매입 뷰 ───────────────────────────────────────────────
function PurchasesView({ active }: { active: boolean }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [activeTab, setActiveTab] = useState<PurchaseTab>('전체');

  const [scanning, setScanning] = useState(false);
  const purchaseTypes = usePurchaseTypes();
  const yearMonth = toYearMonth(year, month);
  const { purchases, loading, refetch, remove } = usePurchases(yearMonth);

  useFocusEffect(useCallback(() => {
    if (active) { void refetch(); void purchaseTypes.refetch(); }
  }, [active, refetch, purchaseTypes.refetch]));

  const [refreshing, setRefreshing] = useState(false);
  async function onRefresh() {
    setRefreshing(true);
    try { await Promise.all([refetch(), purchaseTypes.refetch()]); } finally { setRefreshing(false); }
  }

  const purchaseTabs = ['전체', ...new Set([...purchaseTypes.types, ...purchases.map(p => p.type)])];
  const days = getCalendarDays(year, month);
  const filtered = purchases.filter(p => activeTab === '전체' || p.type === activeTab);
  const purchaseByDay = new Map<string, typeof filtered>();
  filtered.forEach(p => {
    const list = purchaseByDay.get(p.date) ?? [];
    list.push(p);
    purchaseByDay.set(p.date, list);
  });
  const selectedKey = selectedDay ? toDateKey(year, month, selectedDay) : null;
  const selectedPurchases = selectedKey ? (purchaseByDay.get(selectedKey) ?? []) : [];
  const monthTotal = filtered.reduce((s, p) => s + p.amount, 0);

  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (selectedPurchases.length === 0) return;
    getPurchaseItemCounts(selectedPurchases.map(p => p.id)).then(setItemCounts).catch(() => {});
  }, [selectedKey, purchases]);
  const isToday = (day: number) => year === today.getFullYear() && month === today.getMonth() && day === today.getDate();

  function confirmDeletePurchase(id: string) {
    Alert.alert('삭제', '이 매입 내역을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => { animateListChange(); remove(id).catch(e => Alert.alert('삭제 실패', getErrorMessage(e))); } },
    ]);
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); } else setMonth(m => m - 1);
    setSelectedDay(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); } else setMonth(m => m + 1);
    setSelectedDay(null);
  }

  function goNewPurchase() {
    const dateParam = selectedDay ? toDateKey(year, month, selectedDay) : undefined;
    router.push({ pathname: '/purchases/new', params: dateParam ? { date: dateParam } : {} });
  }

  function handleScan() {
    Alert.alert('매입서 스캔', '이미지를 어떻게 가져올까요?', [
      {
        text: '카메라로 촬영',
        onPress: async () => {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) { Alert.alert('권한 필요', '카메라 권한이 필요합니다. 설정에서 허용해주세요.'); return; }
          const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
          if (!result.canceled && result.assets[0].base64) {
            await processImages([{ uri: result.assets[0].uri, base64: result.assets[0].base64 }]);
          }
        },
      },
      {
        text: '앨범에서 선택',
        onPress: async () => {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) { Alert.alert('권한 필요', '사진 접근 권한이 필요합니다. 설정에서 허용해주세요.'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.8, allowsMultipleSelection: true });
          if (!result.canceled && result.assets.length > 0) {
            const assets = result.assets.filter(a => a.base64) as Array<{ uri: string; base64: string }>;
            if (assets.length > 0) await processImages(assets);
          }
        },
      },
      { text: '취소', style: 'cancel' },
    ]);
  }

  async function processImages(assets: Array<{ uri: string; base64: string }>) {
    setScanning(true);
    try {
      const allItems: unknown[] = [];
      for (const asset of assets) {
        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        const ocrText = await callOcrEdgeFunction(manipulated.base64!);
        const parsed = JSON.parse(ocrText);
        if (Array.isArray(parsed)) allItems.push(...parsed);
      }
      router.push({
        pathname: '/purchases/ocr-review',
        params: { imageUri: assets[0].uri, ocrText: JSON.stringify(allItems) },
      });
    } catch (e: any) {
      Alert.alert('OCR 오류', getErrorMessage(e));
    } finally {
      setScanning(false);
    }
  }

  return (
    <>
      <View style={styles.subTabRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
        {purchaseTabs.map(tab => (
          <TouchableOpacity key={tab} style={[styles.subTab, activeTab === tab && styles.subTabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.subTabText, activeTab === tab && styles.subTabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
        </ScrollView>
        <Text style={styles.monthTotalRight}>{loading ? '' : monthTotal > 0 ? `${monthTotal.toLocaleString()}원` : ''}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        <MonthNav year={year} month={month} onPrev={prevMonth} onNext={nextMonth} />

        <View style={styles.calendarCard}>
          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={w} style={[styles.weekDay, i === 0 && styles.sundayText, i === 6 && styles.saturdayText]}>{w}</Text>
            ))}
          </View>
          {Array.from({ length: Math.ceil(days.length / 7) }, (_, rowIdx) => (
            <View key={rowIdx} style={styles.calendarRow}>
              {days.slice(rowIdx * 7, (rowIdx + 1) * 7).map((day, colIdx) => {
                if (!day) return <View key={`e-${rowIdx}-${colIdx}`} style={styles.dayCell} />;
                const key = toDateKey(year, month, day);
                const isSelected = selectedDay === day;
                const todayFlag = isToday(day);
                return (
                  <TouchableOpacity key={day} style={styles.dayCell} onPress={() => setSelectedDay(isSelected ? null : day)} activeOpacity={0.7}>
                    <View style={[styles.dayInner, isSelected && styles.daySelected, !isSelected && todayFlag && styles.dayToday]}>
                      <Text style={[styles.dayText, colIdx === 0 && !isSelected && styles.sundayText, colIdx === 6 && !isSelected && styles.saturdayText, isSelected && styles.dayTextSelected, !isSelected && todayFlag && styles.dayTextToday]}>{day}</Text>
                    </View>
                    {purchaseByDay.has(key) && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>

        {selectedDay !== null && (
          <>
            <Text style={styles.sectionLabel}>{month + 1}월 {selectedDay}일 매입</Text>
            <View style={[styles.listCard, !loading && selectedPurchases.length === 0 && styles.listCardEmpty]}>
              {loading ? <View style={styles.emptyInCard}><ActivityIndicator size="small" color={Colors.gray300} /></View>
                : selectedPurchases.length === 0 ? (
                  <View style={styles.emptyInCard}>
                    <Text style={styles.emptyInCardText}>등록된 매입이 없어요</Text>
                    <Text style={styles.emptyHint}>매입서를 스캔하거나 직접 입력해 주세요.</Text>
                  </View>
                )
                : selectedPurchases.map((p, i) => (
                  <TouchableOpacity key={p.id} style={[styles.purchaseRow, i < selectedPurchases.length - 1 && styles.rowBorder]} onPress={() => router.push(`/purchases/${p.id}`)} onLongPress={() => confirmDeletePurchase(p.id)} activeOpacity={0.7}>
                    <View style={styles.purchaseLeft}>
                      <Text style={styles.purchaseSupplier} numberOfLines={2}>{p.supplier}</Text>
                      {itemCounts[p.id] > 0 && (
                        <Text style={styles.purchaseItemCount}>{itemCounts[p.id]}개 품목</Text>
                      )}
                      <Badge label={p.category} variant="neutral" />
                      <Badge label={p.type} variant="neutral" />
                    </View>
                    <Text style={styles.purchaseAmount}>{p.amount.toLocaleString()}원</Text>
                    <TouchableOpacity onPress={() => confirmDeletePurchase(p.id)} hitSlop={8} style={styles.deleteIconBtn}>
                      <Ionicons name="trash-outline" size={16} color={Colors.gray300} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              }
            </View>
          </>
        )}

        {selectedDay === null && (
          <SummaryCard
            label="이번 달 총 매입"
            amount={loading ? '—' : monthTotal > 0 ? `${monthTotal.toLocaleString()}원` : '—'}
          />
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.scanBtn, scanning && { opacity: 0.5 }]} onPress={handleScan} disabled={scanning} activeOpacity={0.7}>
            {scanning ? <ActivityIndicator size="small" color={Colors.primary} /> : <Text style={styles.scanBtnText}>스캔</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={goNewPurchase} activeOpacity={0.7}>
            <Text style={styles.addBtnText}>+ 매입 추가</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </>
  );
}

// ─── 비용 뷰 ───────────────────────────────────────────────
// ─── 메인 화면 ─────────────────────────────────────────────
const INNER_TABS = ['매입', '비용'] as const;
type InnerTab = (typeof INNER_TABS)[number];

export function PurchasesScreen({ active = true }: { active?: boolean }) {
  const [innerTab, setInnerTab] = useState<InnerTab>('매입');

  const today = new Date();
  const todayKey = toDateKey(today.getFullYear(), today.getMonth(), today.getDate());
  const currentYearMonth = toYearMonth(today.getFullYear(), today.getMonth());
  const { purchases, refetch: refetchPurchases } = usePurchases(currentYearMonth);
  const { expenses, refetch: refetchExpenses } = useExpenses(currentYearMonth);

  useEffect(() => {
    if (!active) return;
    refetchPurchases();
    refetchExpenses();
  }, [active, refetchPurchases, refetchExpenses]);

  const todayPurchaseCount = purchases.filter(p => p.date === todayKey).length;
  const monthExpenseCount = expenses.length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>매입 및 비용</Text>
          <Text style={styles.titleSummary}>오늘 매입 {todayPurchaseCount}건 · 이번달 비용 {monthExpenseCount}건</Text>
        </View>
        <View style={styles.innerTabRow}>
          {INNER_TABS.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.innerTab, innerTab === tab && styles.innerTabActive]}
              onPress={() => setInnerTab(tab)}
              activeOpacity={0.7}
            >
              <Text style={[styles.innerTabText, innerTab === tab && styles.innerTabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {innerTab === '매입' ? <PurchasesView active={active} /> : <ExpensesPanel />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  topBar: {
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12,
    backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100,
  },
  titleRow: { marginBottom: 12 },
  title: { fontSize: 17, fontWeight: '600', color: Colors.black },
  titleSummary: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  innerTabRow: { flexDirection: 'row', gap: 4, backgroundColor: Colors.gray100, borderRadius: 12, padding: 3 },
  innerTab: { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center' },
  innerTabActive: { backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  innerTabText: { fontSize: 14, fontWeight: '500', color: Colors.gray400 },
  innerTabTextActive: { color: Colors.black, fontWeight: '700' },

  subTabRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.white, borderBottomWidth: 0.5, borderBottomColor: Colors.gray100, alignItems: 'center' },
  subTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.gray200, backgroundColor: Colors.gray50 },
  subTabActive: { backgroundColor: Colors.black, borderColor: Colors.black },
  subTabText: { fontSize: 13, color: Colors.gray500 },
  subTabTextActive: { color: Colors.white, fontWeight: '500' },
  monthTotalRight: { marginLeft: 'auto', fontSize: 13, fontWeight: '600', color: Colors.black },

  scroll: { padding: 16, gap: 14, paddingBottom: 48 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 10, backgroundColor: Colors.white, borderWidth: 0.5, borderColor: Colors.gray100 },
  monthLabel: { fontSize: 15, fontWeight: '600', color: Colors.black },

  calendarCard: { backgroundColor: Colors.white, borderRadius: 16, borderWidth: 0.5, borderColor: Colors.gray100, paddingHorizontal: 8, paddingVertical: 12 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500', color: Colors.gray400, paddingVertical: 4 },
  sundayText: { color: '#D94040' },
  saturdayText: { color: '#3A7FD4' },
  calendarRow: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3 },
  dayInner: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  daySelected: { backgroundColor: Colors.black },
  dayToday: { borderWidth: 1.5, borderColor: Colors.primary },
  dayText: { fontSize: 14, color: Colors.black },
  dayTextSelected: { color: Colors.white, fontWeight: '600' },
  dayTextToday: { color: Colors.primary, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary },
  dotSelected: { backgroundColor: Colors.black },

  sectionLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600 },
  listCard: { ...CardStyle },
  listCardEmpty: { backgroundColor: 'transparent', borderWidth: 0 },
  emptyInCard: { paddingVertical: 16, gap: 8 },
  emptyInCardText: { fontSize: 15, fontWeight: '600', color: Colors.black },
  emptyHint: { fontSize: 13, color: Colors.gray500 },
  purchaseRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, justifyContent: 'space-between' },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: Colors.gray100 },
  purchaseLeft: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, flex: 1 },
  purchaseSupplier: { flexShrink: 1, fontSize: 14, fontWeight: '500', color: Colors.black },
  purchaseItemCount: { fontSize: 12, color: Colors.gray400 },
  purchaseAmount: { fontSize: 14, fontWeight: '600', color: Colors.black, marginRight: 10 },
  deleteIconBtn: { padding: 2 },

  actionRow: { flexDirection: 'row', gap: 10 },
  scanBtn: { paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.tinted, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.primary + '40' },
  scanBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  addBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 10, paddingVertical: 14 },
  addBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white },

});

export default PurchasesScreen;
