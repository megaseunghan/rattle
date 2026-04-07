import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { usePosAnalytics } from '../../lib/hooks/usePosAnalytics';
import { useAuth } from '../../lib/contexts/AuthContext';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { DailySummary } from '../../types';

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

  const [dateInput, setDateInput] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);

  const closingTime = (store?.closing_time as string | null | undefined)?.slice(0, 5) ?? '23:00';

  useFocusEffect(useCallback(() => {
    loadTodaySales();
    fetchSummaries(closingTime);
  }, [closingTime, fetchSummaries, loadTodaySales]));

  async function handleManualSync() {
    const date = dateInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      Alert.alert('날짜 형식 오류', 'YYYY-MM-DD 형식으로 입력해주세요. 예: 2026-04-06');
      return;
    }
    setSyncing(true);
    try {
      await syncByDate(date);
      await fetchSummaries(closingTime);
      setDateInput('');
    } catch (e: any) {
      Alert.alert('동기화 실패', e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleSyncCatalog() {
    setSyncingCatalog(true);
    try {
      await syncCatalog();
      Alert.alert('완료', '카탈로그가 동기화되었습니다.');
    } catch (e: any) {
      Alert.alert('카탈로그 동기화 실패', e.message);
    } finally {
      setSyncingCatalog(false);
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
            <TextInput
              style={styles.dateInput}
              value={dateInput}
              onChangeText={setDateInput}
              placeholder="YYYY-MM-DD"
              keyboardType="numbers-and-punctuation"
              maxLength={10}
            />
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
  dateInput: {
    flex: 1, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15,
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
