import { GlassBackdrop } from '../../lib/components/GlassBackdrop';
import { getErrorMessage } from '../../lib/utils/error';
import { useState, useCallback, useRef, useEffect, useContext } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { usePosAnalytics } from '../../lib/hooks/usePosAnalytics';
import { useAuth } from '../../lib/contexts/AuthContext';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { getStoreDetails } from '../../lib/services/stores';
import { useManualSales } from '../../lib/hooks/useManualSales';
import { DailySummary } from '../../types';
import { Badge, EmptyState } from '../../lib/components/ui';
import { TabPagerContext } from '../../lib/contexts/TabPagerContext';

type SyncStatus = 'unregistered' | 'connected';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();
  const days: (number | null)[] = Array(firstDay).fill(null);
  for (let i = 1; i <= lastDate; i++) days.push(i);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function PosScreen({ active = true, reserveFab = false }: { active?: boolean; reserveFab?: boolean }) {
  const tabScope = useContext(TabPagerContext);
  const { store, currentRole } = useAuth();
  const {
    lastSyncAt, todaySales, todayOrderCount,
    loadTodaySales, syncByMonth, autoSyncing, autoSyncRecent, error: syncError,
  } = useTossSync();
  const { summaries, loadingSummaries, fetchSummariesByRange, error: summariesError } = usePosAnalytics();

  const [status, setStatus] = useState<SyncStatus>('unregistered');
  const [loadingStatus, setLoadingStatus] = useState(true);

  const initialMonth = tabScope?.selectedMonth ?? `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [queryYear, setQueryYear] = useState(Number(initialMonth.slice(0, 4)));
  const [queryMonth, setQueryMonth] = useState(Number(initialMonth.slice(5)));
  const [syncing, setSyncing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const statusStore = useRef<string | undefined>(undefined);
  const statusRequest = useRef(0);
  const currentStoreId = useRef(store?.id);
  currentStoreId.current = store?.id;
  const [statusError, setStatusError] = useState<string | null>(null);
  useEffect(() => () => { statusRequest.current += 1; }, []);
  const selectedYearRef = useRef(Number(initialMonth.slice(0, 4)));
  const selectedMonthRef = useRef(Number(initialMonth.slice(5)));

  const closingTime = (store?.closing_time as string | null | undefined)?.slice(0, 5) ?? '23:00';

  const manualYearMonth = `${queryYear}-${String(queryMonth).padStart(2, '0')}`;
  useEffect(() => {
    if (!tabScope?.selectedMonth || tabScope.selectedMonth === manualYearMonth) return;
    const [year, month] = tabScope.selectedMonth.split('-').map(Number);
    setQueryYear(year); setQueryMonth(month); setSelectedDay(null);
    selectedYearRef.current = year; selectedMonthRef.current = month;
    if (active && status === 'connected') {
      const { from, to } = getMonthRange(year, month, closingTime);
      void fetchSummariesByRange(from, to);
    }
  }, [tabScope?.selectedMonth, active, status, closingTime, fetchSummariesByRange]);
  const { sales: manualSales, loading: loadingManualSales, total: manualTotal, refetch: refetchManualSales, remove: removeManualSale } = useManualSales(manualYearMonth);

  useEffect(() => {
    if (!active || status !== 'unregistered') return;
    refetchManualSales();
  }, [active, status, refetchManualSales]);

  // 매출 추가 화면(스택 push)에서 뒤로 돌아왔을 때도 목록 갱신
  useFocusEffect(useCallback(() => {
    if (status === 'unregistered') refetchManualSales();
  }, [status, refetchManualSales]));

  function prevQueryMonth() {
    const previous = new Date(queryYear, queryMonth - 2, 1);
    tabScope?.setSelectedMonth(`${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`);
    setSelectedDay(null);
    if (queryMonth === 1) {
      const y = queryYear - 1; const m = 12;
      setQueryYear(y); setQueryMonth(m);
      selectedYearRef.current = y; selectedMonthRef.current = m;
      const { from, to } = getMonthRange(y, m, closingTime);
      fetchSummariesByRange(from, to);
    } else {
      const m = queryMonth - 1;
      setQueryMonth(m); selectedMonthRef.current = m;
      const { from, to } = getMonthRange(queryYear, m, closingTime);
      fetchSummariesByRange(from, to);
    }
  }

  function nextQueryMonth() {
    const now = new Date();
    if (queryYear === now.getFullYear() && queryMonth === now.getMonth() + 1) return;
    const next = new Date(queryYear, queryMonth, 1);
    tabScope?.setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
    setSelectedDay(null);
    if (queryMonth === 12) {
      const y = queryYear + 1; const m = 1;
      setQueryYear(y); setQueryMonth(m);
      selectedYearRef.current = y; selectedMonthRef.current = m;
      const { from, to } = getMonthRange(y, m, closingTime);
      fetchSummariesByRange(from, to);
    } else {
      const m = queryMonth + 1;
      setQueryMonth(m); selectedMonthRef.current = m;
      const { from, to } = getMonthRange(queryYear, m, closingTime);
      fetchSummariesByRange(from, to);
    }
  }

  function getMonthRange(year: number, month: number, ct: string): { from: Date; to: Date } {
    const [h, m] = ct.split(':').map(Number);
    // 토스 기준: 영업일 D = [D 마감, D+1 마감) → 월 범위 = [M/1 마감, (M+1)/1 마감)
    const from = new Date(year, month - 1, 1);
    from.setHours(h, m, 0, 0);
    const to = new Date(year, month, 1);
    to.setHours(h, m, 0, 0);
    if (to > new Date()) to.setTime(Date.now());
    return { from, to };
  }

  const loadStoreStatus = useCallback(async () => {
    if (!store) return;
    const request = ++statusRequest.current;
    const valid = () => request === statusRequest.current && currentStoreId.current === store.id;
    setStatusError(null);
    // Re-entering the same store must not replace its content with a full-screen loader.
    if (statusStore.current !== store.id) setLoadingStatus(true);
    try {
      const data = await getStoreDetails(store.id);
      if (!valid()) return;
      const newStatus: SyncStatus = data.toss_merchant_id ? 'connected' : 'unregistered';
      setStatus(newStatus);
      statusStore.current = store.id;
      setLoadingStatus(false);
      if (newStatus === 'connected') {
        const ct = data.closing_time?.slice(0, 5) ?? '23:00';
        // Show saved sales immediately, independently of the slower POS import.
        const refreshSaved = () => {
          const { from, to } = getMonthRange(selectedYearRef.current, selectedMonthRef.current, ct);
          return Promise.all([loadTodaySales(), fetchSummariesByRange(from, to)]);
        };
        const saved = refreshSaved();
        await autoSyncRecent(ct, 30);
        await saved;
        if (valid()) await refreshSaved();
      }
    } catch {
      if (valid()) setStatusError('매출 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally { if (valid()) setLoadingStatus(false); }
  }, [store, loadTodaySales, fetchSummariesByRange, autoSyncRecent]);

  useEffect(() => { if (active) void loadStoreStatus(); }, [active, loadStoreStatus]);

  async function handleManualSync() {
    setSyncing(true);
    try {
      const { from, to } = getMonthRange(queryYear, queryMonth, closingTime);
      if (currentRole === 'admin') await syncByMonth(queryYear, queryMonth);
      await loadTodaySales();
      await fetchSummariesByRange(from, to);
    } catch (e: any) {
      Alert.alert('동기화 실패', getErrorMessage(e));
    } finally {
      setSyncing(false);
    }
  }

  const statusLabel = status === 'connected' ? 'Toss POS 연동' : 'Toss POS 미연동';

  return (
    <SafeAreaView style={styles.container} edges={tabScope ? ['left', 'right'] : ['top', 'left', 'right', 'bottom']}><GlassBackdrop />
      <View style={styles.header}>
        <View style={styles.headerTitle}>
          <Text style={styles.title}>매출</Text>
          {status === 'connected' && lastSyncAt && (
            <Text style={styles.lastSync}>
              마지막 동기화{' '}
              {new Date(lastSyncAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {status === 'connected' && (autoSyncing || syncing) && (
            <View style={styles.syncingBadge}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.syncingText}>동기화 중</Text>
            </View>
          )}
          <Badge label={statusLabel} variant={status === 'connected' ? 'auto' : 'neutral'} />
        </View>
      </View>

      {statusError && <View style={styles.notice}><Text style={styles.noticeText}>{statusError}</Text><TouchableOpacity onPress={() => { void loadStoreStatus(); }} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: Colors.action }}>다시 시도</Text></TouchableOpacity></View>}
      {loadingStatus || currentStoreId.current !== statusStore.current
        ? <View style={styles.scroll}><View style={styles.todayCard}><Text style={styles.todayLabel}>매출을 준비하고 있어요</Text><LoadingSpinner fullScreen={false} /><Text style={styles.todayOrderCount}>저장된 매출을 먼저 불러오고 있어요.</Text></View></View>
        : status === 'connected'
          ? (() => {
              const summaryByDay = new Map<string, DailySummary>();
              summaries.forEach(s => summaryByDay.set(s.date, s));
              const calendarDays = getCalendarDays(queryYear, queryMonth);
              const selectedKey = selectedDay ? toDateKey(queryYear, queryMonth, selectedDay) : null;
              const selectedSummary = selectedKey ? summaryByDay.get(selectedKey) ?? null : null;
              const monthTotal = summaries.reduce((sum, s) => sum + s.totalAmount, 0);
              const today = new Date();
              const isToday = (day: number) =>
                queryYear === today.getFullYear() &&
                queryMonth === today.getMonth() + 1 &&
                day === today.getDate();

              return (
                <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                  {/* 날짜 요약 카드 (선택된 날짜 or 오늘) */}
                  <View style={styles.todayCard}>
                    <Text style={styles.todayLabel}>
                      {selectedSummary ? `${queryMonth}월 ${selectedDay}일 매출` : '오늘 매출'}
                    </Text>
                    <Text style={styles.todayValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                      {(selectedSummary ? selectedSummary.totalAmount : todaySales).toLocaleString('ko-KR')}원
                    </Text>
                    <Text style={styles.todayOrderCount}>
                      주문 {selectedSummary ? selectedSummary.orderCount : todayOrderCount}건
                    </Text>
                  </View>

                  {/* 월 조회 */}
                  <View style={styles.querySection}>
                    <View style={styles.queryRow}>
                      <View style={styles.monthPickerRow}>
                        <TouchableOpacity onPress={prevQueryMonth} style={styles.monthNavBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="이전 달">
                          <Ionicons name="chevron-back" size={18} color={Colors.gray600} />
                        </TouchableOpacity>
                        <Text style={styles.monthPickerText}>{queryYear}년 {queryMonth}월</Text>
                        <TouchableOpacity onPress={nextQueryMonth} style={styles.monthNavBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="다음 달">
                          <Ionicons name="chevron-forward" size={18} color={Colors.gray600} />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
                        onPress={handleManualSync}
                        disabled={syncing}
                      >
                        {syncing
                          ? <ActivityIndicator size="small" color={Colors.white} />
                          : <><Ionicons name="search-outline" size={15} color={Colors.white} /><Text style={styles.syncBtnText}>조회</Text></>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 월 합계 헤더 */}
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{queryYear}년 {queryMonth}월 매출</Text>
                    {monthTotal > 0 && (
                      <Text style={styles.sectionTotal}>{monthTotal.toLocaleString('ko-KR')}원</Text>
                    )}
                  </View>

                  {(autoSyncing || syncing || loadingSummaries) && <View style={styles.notice} accessibilityLiveRegion="polite"><ActivityIndicator size="small" color={Colors.primary} /><Text style={styles.noticeText}>{summaries.length ? '기존 매출을 보여드리고 있어요. 동기화가 끝나면 갱신돼요.' : '매출을 불러오는 중이에요. 잠시만 기다려 주세요.'}</Text></View>}
                  {(summariesError || syncError) && <View style={styles.notice}><Text style={styles.noticeText}>최신 매출을 불러오지 못했어요. 조회 버튼을 눌러 다시 시도해 주세요.</Text></View>}
                  {(
                      <>
                        {/* 캘린더 */}
                        <View style={styles.calendarCard}>
                          <View style={styles.weekRow}>
                            {WEEKDAYS.map((w, i) => (
                              <Text key={w} style={[styles.weekDay, i === 0 && styles.sundayText, i === 6 && styles.saturdayText]}>{w}</Text>
                            ))}
                          </View>
                          {Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, rowIdx) => (
                            <View key={rowIdx} style={styles.calendarRow}>
                              {calendarDays.slice(rowIdx * 7, (rowIdx + 1) * 7).map((day, colIdx) => {
                                if (!day) return <View key={`empty-${rowIdx}-${colIdx}`} style={styles.dayCell} />;
                                const key = toDateKey(queryYear, queryMonth, day);
                                const hasSales = summaryByDay.has(key);
                                const isSelected = selectedDay === day;
                                const todayFlag = isToday(day);
                                const isSun = colIdx === 0;
                                const isSat = colIdx === 6;
                                return (
                                  <TouchableOpacity
                                    key={day}
                                    style={styles.dayCell}
                                    onPress={() => setSelectedDay(isSelected ? null : day)}
                                    activeOpacity={0.7}
                                  >
                                    <View style={[styles.dayInner, isSelected && styles.daySelected, !isSelected && todayFlag && styles.dayToday]}>
                                      <Text style={[
                                        styles.dayText,
                                        isSun && !isSelected && styles.sundayText,
                                        isSat && !isSelected && styles.saturdayText,
                                        isSelected && styles.dayTextSelected,
                                        !isSelected && todayFlag && styles.dayTextToday,
                                      ]}>
                                        {day}
                                      </Text>
                                    </View>
                                    {hasSales && <View style={[styles.dot, isSelected && styles.dotSelected]} />}
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          ))}
                        </View>

                        {/* 선택된 날짜 매출 요약 */}
                        {selectedDay !== null && (selectedSummary || !(loadingSummaries || autoSyncing || syncing || summariesError || syncError)) && (
                          selectedSummary ? (
                            <TouchableOpacity
                              style={styles.selectedDayCard}
                              onPress={() => router.push(`/pos/${selectedSummary.date}?from=${encodeURIComponent(selectedSummary.dateFrom)}&to=${encodeURIComponent(selectedSummary.dateTo)}`)}
                              activeOpacity={0.75}
                            >
                              <View style={styles.selectedDayInfo}>
                                <Text style={styles.selectedDayDate}>{queryMonth}월 {selectedDay}일</Text>
                                <Text style={styles.selectedDayCount}>{selectedSummary.orderCount}건</Text>
                              </View>
                              <View style={styles.selectedDayRight}>
                                <Text style={styles.selectedDayAmount}>{selectedSummary.totalAmount.toLocaleString('ko-KR')}원</Text>
                                <View style={styles.dayCardChevron}>
                                  <Ionicons name="chevron-forward" size={14} color={Colors.gray400} />
                                </View>
                              </View>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.selectedDayEmpty}>
                              <Text style={styles.selectedDayEmptyText}>{queryMonth}월 {selectedDay}일 매출 없음</Text>
                            </View>
                          )
                        )}

                        {/* 날짜 미선택 + 데이터 없음 */}
                        {selectedDay === null && summaries.length === 0 && !loadingSummaries && !autoSyncing && !syncing && !summariesError && !syncError && (
                          <EmptyState
                            icon="storefront-outline"
                            title="이 달의 내역이 없어요"
                            description="조회 버튼을 눌러 데이터를 불러오세요"
                          />
                        )}
                      </>
                    )
                  }
                </ScrollView>
              );
            })()
          : (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              {/* ── 미연동: POS 연동 화면으로 안내 ── */}
              <View style={styles.infoCard}>
                <Ionicons name="storefront-outline" size={28} color={Colors.primary} style={{ marginBottom: 10 }} />
                <Text style={styles.infoTitle}>아직 POS가 연동되지 않았어요</Text>
                <Text style={styles.infoDesc}>
                  토스 포스에서 Rattle 서비스코드로 연동하면{'\n'}매출 데이터가 자동으로 표시됩니다.
                </Text>
                <TouchableOpacity
                  style={styles.applyBtn}
                  accessibilityRole="button"
                  onPress={() => router.push('/settings/pos-sync')}
                >
                  <Text style={styles.applyBtnText}>POS 연동하기</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.notice}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.gray400} />
                <Text style={styles.noticeText}>
                  포스 설정 &gt; 서비스 연동에서 서비스코드를 입력하면 자동으로 연결됩니다.
                </Text>
              </View>

              {/* ── 화면 10/11: 수기 매출 ── */}
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{queryYear}년 {queryMonth}월 수기 매출</Text>
                {manualTotal > 0 && <Text style={styles.sectionTotal}>{manualTotal.toLocaleString('ko-KR')}원</Text>}
              </View>

              <View style={styles.monthPickerRow}>
                <TouchableOpacity onPress={prevQueryMonth} style={styles.monthNavBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="이전 달">
                  <Ionicons name="chevron-back" size={18} color={Colors.gray600} />
                </TouchableOpacity>
                <Text style={styles.monthPickerText}>{queryYear}년 {queryMonth}월</Text>
                <TouchableOpacity onPress={nextQueryMonth} style={styles.monthNavBtn} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="다음 달">
                  <Ionicons name="chevron-forward" size={18} color={Colors.gray600} />
                </TouchableOpacity>
              </View>

              {loadingManualSales ? (
                <LoadingSpinner fullScreen={false} />
              ) : manualSales.length === 0 ? (
                <EmptyState
                  icon="cash-outline"
                  title="이번 달 등록된 매출이 없어요"
                  description="POS 연동 전이라면 직접 등록해서 손익계산서에 반영할 수 있어요"
                  ctaLabel="매출 등록하기"
                  onCtaPress={() => router.push('/pos/new')}
                />
              ) : (
                <>
                  <View style={styles.manualList}>
                    {manualSales.map((s, i) => {
                      const parts: string[] = [];
                      if (Number(s.card_amount) > 0) parts.push(`카드 ${Number(s.card_amount).toLocaleString('ko-KR')}원`);
                      if (Number(s.cash_amount) > 0) parts.push(`현금 ${Number(s.cash_amount).toLocaleString('ko-KR')}원`);
                      if (Number(s.discount_amount) > 0) parts.push(`할인 -${Number(s.discount_amount).toLocaleString('ko-KR')}원`);
                      const methodLabel = parts.join(' · ') + (s.memo ? ` · ${s.memo}` : '');
                      const total = Number(s.card_amount) + Number(s.cash_amount);
                      return (
                      <View key={s.id} style={[styles.manualRow, i > 0 && styles.manualRowBorder]}>
                        <View style={styles.manualRowInfo}>
                          <Text style={styles.manualRowDate}>{s.date.slice(5).replace('-', '/')}</Text>
                          <Text style={styles.manualRowMethod} numberOfLines={1}>{methodLabel}</Text>
                        </View>
                        <Text style={styles.manualRowAmount}>{total.toLocaleString('ko-KR')}원</Text>
                        <TouchableOpacity
                          onPress={() => Alert.alert('삭제', '이 매출 기록을 삭제할까요?', [
                            { text: '취소', style: 'cancel' },
                            { text: '삭제', style: 'destructive', onPress: () => removeManualSale(s.id) },
                          ])}
                          hitSlop={8}
                        >
                          <Ionicons name="trash-outline" size={16} color={Colors.negative} />
                        </TouchableOpacity>
                      </View>
                      );
                    })}
                  </View>
                  <TouchableOpacity style={styles.addManualBtn} onPress={() => router.push('/pos/new')} activeOpacity={0.7}>
                    <Ionicons name="add" size={16} color={Colors.primary} />
                    <Text style={styles.addManualBtnText}>매출 추가</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          )
      }
      {reserveFab && <View style={{ height: 72 }} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: 'transparent',
  },
  headerTitle: { flexGrow: 1, minWidth: 120 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.black, letterSpacing: -0.5 },
  lastSync: { fontSize: 12, color: Colors.gray400, marginTop: 3 },
  headerRight: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  syncingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.tinted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  syncingText: { fontSize: 12, color: Colors.dark, fontWeight: '600' },

  scroll: { padding: 20, paddingTop: 8, paddingBottom: 48 },

  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  infoTitle: { fontSize: 17, fontWeight: '700', color: Colors.black, marginBottom: 8 },
  infoDesc: { fontSize: 13, color: Colors.gray600, textAlign: 'center', lineHeight: 20 },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.black,
    marginBottom: 10,
  },
  sectionTotal: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.primary,
  },
  card: {
    backgroundColor: Colors.white, borderRadius: 20,
    padding: 16, borderWidth: 1, borderColor: Colors.homeBorder, marginBottom: 16,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: Colors.black, backgroundColor: Colors.gray50,
  },
  applyBtn: {
    backgroundColor: Colors.contextBg, borderRadius: 12, alignSelf: 'center',
    minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center', alignItems: 'center', marginTop: 12,
  },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { color: Colors.action, fontSize: 13, fontWeight: '600' },
  notice: {
    flexDirection: 'row', gap: 8, padding: 14,
    backgroundColor: Colors.gray100, borderRadius: 12, marginBottom: 16,
  },
  noticeText: { flex: 1, fontSize: 13, color: Colors.gray500, lineHeight: 20 },

  manualList: {
    backgroundColor: Colors.white, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder,
    overflow: 'hidden', marginTop: 8,
  },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  manualRowBorder: { borderTopWidth: 0.5, borderTopColor: Colors.gray100 },
  manualRowInfo: { flex: 1, gap: 2 },
  manualRowDate: { fontSize: 13, fontWeight: '700', color: Colors.black },
  manualRowMethod: { fontSize: 11, fontWeight: '400', color: Colors.gray400 },
  manualRowAmount: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  addManualBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: 10, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.primary,
  },
  addManualBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  pendingCard: {
    backgroundColor: Colors.white, borderRadius: 20,
    padding: 32, borderWidth: 1, borderColor: Colors.homeBorder,
    marginTop: 8,
  },
  pendingTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 8, textAlign: 'center' },
  pendingDesc: { fontSize: 14, color: Colors.gray500, textAlign: 'center', lineHeight: 22 },
  merchantInput: {
    marginTop: 16,
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: Colors.black, backgroundColor: Colors.gray50,
  },
  checkBtn: {
    marginTop: 12, alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.primary,
  },
  checkBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },

  todayCard: {
    backgroundColor: Colors.white,
    borderRadius: 24,
    padding: 20,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    gap: 10,
  },
  todayValue: { fontSize: 34, fontFamily: Fonts.spaceGroteskBold, fontWeight: '700', color: Colors.black, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  todayLabel: { fontSize: 13, color: Colors.gray600, fontWeight: '500' },
  todayOrderCount: { fontSize: 14, color: Colors.gray600 },

  querySection: { marginBottom: 20 },
  queryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  monthPickerRow: {
    flex: 1,
    minWidth: 220,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.homeBorder,
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  monthNavBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthPickerText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: Colors.black,
  },
  syncBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 16, minHeight: 52, justifyContent: 'center',
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  dayCard: {
    backgroundColor: Colors.white, borderRadius: 20,
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderColor: Colors.homeBorder,
  },
  dayCardLeft: { gap: 3 },
  dayCardDate: { fontSize: 15, fontWeight: '700', color: Colors.black },
  dayCardCount: { fontSize: 12, color: Colors.gray500 },
  dayCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayCardAmount: { fontSize: 16, fontWeight: '800', color: Colors.primary, letterSpacing: -0.3 },
  dayCardChevron: {
    width: 24, height: 24, borderRadius: 8,
    backgroundColor: Colors.gray100, justifyContent: 'center', alignItems: 'center',
  },

  // 캘린더
  calendarCard: {
    backgroundColor: Colors.white, borderRadius: 24,
    borderWidth: 0.5, borderColor: Colors.homeBorder,
    paddingHorizontal: 8, paddingVertical: 12, marginBottom: 12,
  },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500', color: Colors.gray400, paddingVertical: 4 },
  sundayText: { color: Colors.negative },
  saturdayText: { color: Colors.primary },
  calendarRow: { flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 3 },
  dayInner: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  daySelected: { backgroundColor: Colors.primary },
  dayToday: { borderWidth: 1.5, borderColor: Colors.primary },
  dayText: { fontSize: 14, color: Colors.black },
  dayTextSelected: { color: Colors.white, fontWeight: '600' },
  dayTextToday: { color: Colors.primary, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.primary },
  dotSelected: { backgroundColor: Colors.white },

  // 선택된 날짜 요약
  selectedDayCard: {
    backgroundColor: Colors.white, borderRadius: 20,
    paddingVertical: 14, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 0.5, borderColor: Colors.homeBorder,
  },
  selectedDayInfo: { gap: 3, flexShrink: 1 },
  selectedDayDate: { fontSize: 15, fontWeight: '700', color: Colors.black },
  selectedDayCount: { fontSize: 12, color: Colors.gray500 },
  selectedDayRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  selectedDayAmount: { fontSize: 16, fontWeight: '700', color: Colors.primary, letterSpacing: -0.3, flexShrink: 1 },
  selectedDayEmpty: {
    backgroundColor: Colors.white, borderRadius: 20,
    paddingVertical: 18, alignItems: 'center',
    borderWidth: 0.5, borderColor: Colors.homeBorder,
  },
  selectedDayEmptyText: { fontSize: 14, color: Colors.gray400 },
});

export default PosScreen;
