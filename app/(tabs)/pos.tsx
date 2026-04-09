import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Modal, Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { usePosAnalytics } from '../../lib/hooks/usePosAnalytics';
import { useAuth } from '../../lib/contexts/AuthContext';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { DailySummary } from '../../types';
import { CatalogImportModal } from '../../lib/components/CatalogImportModal';
import { upsertRecipesFromCatalog } from '../../lib/services/recipes';
import { TossCatalogItem } from '../../types';

function SummaryCard({ summary, onPress }: { summary: DailySummary; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.dayCard} onPress={onPress}>
      <View style={styles.dayCardLeft}>
        <Text style={styles.dayCardDate}>{summary.date}</Text>
        <Text style={styles.dayCardCount}>{summary.orderCount}건</Text>
      </View>
      <View style={styles.dayCardRight}>
        <Text style={styles.dayCardAmount}>{summary.totalAmount.toLocaleString('ko-KR')}원</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
      </View>
    </TouchableOpacity>
  );
}

export default function PosScreen() {
  const { store } = useAuth();
  const {
    lastSyncAt, todaySales, todayOrderCount,
    syncCatalog, loadTodaySales, syncByDate, autoSyncing,
  } = useTossSync();
  const { summaries, loadingSummaries, fetchSummaries } = usePosAnalytics();

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [catalogItems, setCatalogItems] = useState<TossCatalogItem[]>([]);
  const [showCatalogImport, setShowCatalogImport] = useState(false);

  function formatDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function onDateChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setShowPicker(false);
    if (event.type === 'dismissed') return;
    if (date) setSelectedDate(date);
  }

  const closingTime = (store?.closing_time as string | null | undefined)?.slice(0, 5) ?? '23:00';

  useFocusEffect(useCallback(() => {
    loadTodaySales();
    fetchSummaries(closingTime);
  }, [closingTime, fetchSummaries, loadTodaySales]));

  async function handleManualSync() {
    setSyncing(true);
    try {
      await syncByDate(formatDate(selectedDate));
      await fetchSummaries(closingTime);
    } catch (e: any) {
      Alert.alert('동기화 실패', e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncCatalog() {
    setSyncingCatalog(true);
    try {
      const items = await syncCatalog();
      setCatalogItems(items);
      setShowCatalogImport(true);
    } catch (e: any) {
      Alert.alert('카탈로그 동기화 실패', e.message);
    } finally {
      setSyncingCatalog(false);
    }
  }

  async function handleCatalogImportConfirm(selectedItems: TossCatalogItem[]) {
    if (!store) return;
    try {
      const count = await upsertRecipesFromCatalog(
        store.id,
        selectedItems.map(i => ({
          name: i.itemName,
          category: i.categoryName,
          sellingPrice: i.price,
        }))
      );
      setShowCatalogImport(false);
      Alert.alert('완료', `${count}개 품목이 레시피에 추가/업데이트되었습니다.`);
    } catch (e: any) {
      Alert.alert('레시피 추가 실패', e.message);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Toss Place POS</Text>
        {lastSyncAt && (
          <Text style={styles.lastSync}>
            최근 동기화: {new Date(lastSyncAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 오늘 요약 */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Ionicons name="cash-outline" size={22} color={Colors.primary} style={styles.summaryIcon} />
            <Text style={styles.summaryValue}>{todaySales.toLocaleString('ko-KR')}원</Text>
            <Text style={styles.summaryLabel}>오늘 매출</Text>
          </View>
          <View style={styles.summaryCard}>
            <Ionicons name="receipt-outline" size={22} color={Colors.primary} style={styles.summaryIcon} />
            <Text style={styles.summaryValue}>{todayOrderCount}건</Text>
            <Text style={styles.summaryLabel}>오늘 주문</Text>
          </View>
        </View>

        {/* 수동 날짜 조회 */}
        <View style={styles.manualSection}>
          <Text style={styles.sectionTitle}>날짜 조회</Text>
          <View style={styles.manualRow}>
            <TouchableOpacity
              style={styles.datePickerBtn}
              onPress={() => setShowPicker(true)}
            >
              <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
              <Text style={styles.datePickerText}>{formatDate(selectedDate)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
              onPress={handleManualSync}
              disabled={syncing}
            >
              {syncing
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.syncBtnText}>조회</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* DateTimePicker — Android: 다이얼로그, iOS: 모달 */}
        {Platform.OS === 'android' && showPicker && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            maximumDate={new Date()}
            onChange={onDateChange}
          />
        )}
        {Platform.OS === 'ios' && (
          <Modal transparent animationType="slide" visible={showPicker}>
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowPicker(false)}
            >
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="inline"
                  maximumDate={new Date()}
                  onChange={onDateChange}
                  locale="ko-KR"
                />
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* 일별 요약 목록 */}
        <Text style={styles.sectionTitle}>최근 영업 내역</Text>
        {autoSyncing && <ActivityIndicator size="small" color={Colors.primary} style={{ marginBottom: 8 }} />}
        {loadingSummaries
          ? <LoadingSpinner />
          : summaries.length === 0
            ? <Text style={styles.emptyText}>동기화된 내역이 없습니다.</Text>
            : summaries.map(s => (
                <SummaryCard
                  key={s.date}
                  summary={s}
                  onPress={() => router.push(`/pos/${s.date}?from=${encodeURIComponent(s.dateFrom)}&to=${encodeURIComponent(s.dateTo)}`)}
                />
              ))
        }

        {/* 카탈로그 동기화 */}
        <TouchableOpacity
          style={[styles.catalogBtn, syncingCatalog && styles.syncBtnDisabled]}
          onPress={handleSyncCatalog}
          disabled={syncingCatalog}
        >
          {syncingCatalog
            ? <ActivityIndicator size="small" color={Colors.primary} />
            : <>
                <Ionicons name="sync-outline" size={16} color={Colors.primary} />
                <Text style={styles.catalogBtnText}>카탈로그 동기화</Text>
              </>
          }
        </TouchableOpacity>
      </ScrollView>
      <CatalogImportModal
        visible={showCatalogImport}
        items={catalogItems}
        onConfirm={handleCatalogImportConfirm}
        onClose={() => setShowCatalogImport(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: Colors.white,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.black },
  lastSync: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  scroll: { padding: 16, paddingBottom: 40 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  summaryCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 14,
    padding: 16, alignItems: 'center', borderWidth: 1, borderColor: Colors.gray100,
  },
  summaryIcon: { marginBottom: 6 },
  summaryValue: { fontSize: 18, fontWeight: '800', color: Colors.black, marginBottom: 2 },
  summaryLabel: { fontSize: 12, color: Colors.gray500 },
  manualSection: { marginBottom: 20 },
  manualRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  datePickerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  datePickerText: { fontSize: 15, color: Colors.black, fontWeight: '500' },
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)',
  },
  pickerContainer: {
    backgroundColor: Colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16,
  },
  syncBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center',
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.black, marginBottom: 10 },
  dayCard: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: Colors.gray100, marginBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dayCardLeft: { gap: 2 },
  dayCardDate: { fontSize: 15, fontWeight: '700', color: Colors.black },
  dayCardCount: { fontSize: 13, color: Colors.gray500 },
  dayCardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayCardAmount: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  emptyText: { fontSize: 14, color: Colors.gray400, textAlign: 'center', paddingVertical: 20 },
  catalogBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 24, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.primary,
  },
  catalogBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '600' },
});
