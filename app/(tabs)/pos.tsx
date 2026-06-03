import { useState, useCallback, useRef } from 'react';
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
import { getStoreDetails, updateStoreInfo } from '../../lib/services/stores';
import { submitTossPlaceApplication } from '../../lib/services/tossPlaceForm';
import { DailySummary } from '../../types';

type SyncStatus = 'unregistered' | 'pending' | 'connected';

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

export default function PosScreen() {
  const { store } = useAuth();
  const {
    lastSyncAt, todaySales, todayOrderCount,
    loadTodaySales, syncByMonth, autoSyncing, autoSyncRecent,
  } = useTossSync();
  const { summaries, loadingSummaries, fetchSummariesByRange } = usePosAnalytics();

  const [status, setStatus] = useState<SyncStatus>('unregistered');
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [storeName, setStoreName] = useState(store?.name ?? '');
  const [businessNumber, setBusinessNumber] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [merchantId, setMerchantId] = useState('');

  const [queryYear, setQueryYear] = useState(new Date().getFullYear());
  const [queryMonth, setQueryMonth] = useState(new Date().getMonth() + 1);
  const [syncing, setSyncing] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const hasLoadedRef = useRef(false);
  const selectedYearRef = useRef(new Date().getFullYear());
  const selectedMonthRef = useRef(new Date().getMonth() + 1);

  const closingTime = (store?.closing_time as string | null | undefined)?.slice(0, 5) ?? '23:00';

  function prevQueryMonth() {
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
    const from = new Date(year, month - 1, 0);
    from.setHours(h, m, 0, 0);
    const to = new Date(year, month, 0);
    to.setHours(h, m, 0, 0);
    if (to > new Date()) to.setTime(Date.now());
    return { from, to };
  }

  const loadStoreStatus = useCallback(async () => {
    if (!store) return;
    try {
      const data = await getStoreDetails(store.id);
      setStoreName(data.name ?? '');
      setBusinessNumber(data.business_number ?? '');
      setOwnerPhone(data.owner_phone ?? '');
      setAddress(data.address ?? '');

      const newStatus: SyncStatus = data.toss_merchant_id ? 'connected'
        : data.business_number ? 'pending'
        : 'unregistered';
      setStatus(newStatus);

      if (newStatus === 'connected') {
        const ct = (data.closing_time as string | null | undefined)?.slice(0, 5) ?? '23:00';
        await autoSyncRecent(ct, 30);
        loadTodaySales();

        if (!hasLoadedRef.current) {
          hasLoadedRef.current = true;
          const curYear = new Date().getFullYear();
          const curMonth = new Date().getMonth() + 1;
          selectedYearRef.current = curYear;
          selectedMonthRef.current = curMonth;
          setQueryYear(curYear);
          setQueryMonth(curMonth);
          const { from, to } = getMonthRange(curYear, curMonth, ct);
          await fetchSummariesByRange(from, to);
        } else {
          const { from, to } = getMonthRange(selectedYearRef.current, selectedMonthRef.current, ct);
          await fetchSummariesByRange(from, to);
        }
      }
    } catch {}
    setLoadingStatus(false);
  }, [store, loadTodaySales, fetchSummariesByRange, autoSyncRecent]);

  useFocusEffect(useCallback(() => {
    setLoadingStatus(true);
    loadStoreStatus();
  }, [loadStoreStatus]));

  async function handleApply() {
    if (!store) return;
    if (!businessNumber.trim() || !ownerPhone.trim() || !address.trim()) {
      Alert.alert('입력 오류', '모든 항목을 입력해주세요.');
      return;
    }
    if (!/^\d{3}-\d{2}-\d{5}$/.test(businessNumber.trim())) {
      Alert.alert('입력 오류', '사업자번호 형식이 올바르지 않습니다 (예: 000-00-00000).');
      return;
    }
    if (!/^01[016789]-\d{3,4}-\d{4}$/.test(ownerPhone.trim())) {
      Alert.alert('입력 오류', '연락처 형식이 올바르지 않습니다 (예: 010-1234-5678).');
      return;
    }
    setSaving(true);
    try {
      await updateStoreInfo(store.id, {
        name: storeName.trim(),
        business_number: businessNumber.trim(),
        owner_phone: ownerPhone.trim(),
        address: address.trim(),
      });
      await submitTossPlaceApplication({
        name: storeName.trim(),
        address: address.trim(),
        businessNumber: businessNumber.trim(),
        ownerPhone: ownerPhone.trim(),
      });
      setStatus('pending');
    } catch (e: any) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMerchantId() {
    if (!store) return;
    const trimmed = merchantId.trim();
    if (!trimmed) {
      Alert.alert('입력 오류', '가맹점 ID를 입력해주세요.');
      return;
    }
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(trimmed)) {
      Alert.alert('입력 오류', '유효하지 않은 가맹점 ID입니다.');
      return;
    }
    setSaving(true);
    try {
      await updateStoreInfo(store.id, { toss_merchant_id: trimmed });
      setStatus('connected');
      loadTodaySales();
      const { from, to } = getMonthRange(queryYear, queryMonth, closingTime);
      await fetchSummariesByRange(from, to);
    } catch (e: any) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleManualSync() {
    setSyncing(true);
    try {
      const { from, to } = getMonthRange(queryYear, queryMonth, closingTime);
      await syncByMonth(queryYear, queryMonth);
      await fetchSummariesByRange(from, to);
    } catch (e: any) {
      Alert.alert('동기화 실패', e.message);
    } finally {
      setSyncing(false);
    }
  }

  const statusLabel = status === 'connected' ? '연동완료' : status === 'pending' ? '심사중' : '미연동';
  const statusIcon = status === 'connected' ? 'checkmark-circle' as const
    : status === 'pending' ? 'time-outline' as const
    : 'ellipse-outline' as const;
  const statusColor = status === 'connected' ? Colors.success : status === 'pending' ? Colors.warning : Colors.gray400;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Toss Place POS</Text>
          {status === 'connected' && lastSyncAt && (
            <Text style={styles.lastSync}>
              마지막 동기화{' '}
              {new Date(lastSyncAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
        </View>
        <View style={styles.headerRight}>
          {status === 'connected' && autoSyncing && (
            <View style={styles.syncingBadge}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.syncingText}>동기화 중</Text>
            </View>
          )}
          <View style={[
            styles.statusBadge,
            status === 'connected' ? styles.statusConnected
              : status === 'pending' ? styles.statusPending
              : styles.statusDisconnected,
          ]}>
            <Ionicons name={statusIcon} size={13} color={statusColor} />
            <Text style={[
              styles.statusText,
              status === 'connected' ? styles.statusTextConnected
                : status === 'pending' ? styles.statusTextPending
                : styles.statusTextDisconnected,
            ]}>
              {statusLabel}
            </Text>
          </View>
        </View>
      </View>

      {loadingStatus
        ? <LoadingSpinner fullScreen={false} />
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
                    <View style={styles.todayCardItem}>
                      <View style={styles.todayIconBg}>
                        <Ionicons name="cash-outline" size={20} color={Colors.dark} />
                      </View>
                      <Text style={styles.todayValue}>
                        {(selectedSummary ? selectedSummary.totalAmount : todaySales).toLocaleString('ko-KR')}원
                      </Text>
                      <Text style={styles.todayLabel}>
                        {selectedSummary ? `${queryMonth}월 ${selectedDay}일 매출` : '오늘 매출'}
                      </Text>
                    </View>
                    <View style={styles.todayDivider} />
                    <View style={styles.todayCardItem}>
                      <View style={styles.todayIconBg}>
                        <Ionicons name="receipt-outline" size={20} color={Colors.dark} />
                      </View>
                      <Text style={styles.todayValue}>
                        {selectedSummary ? selectedSummary.orderCount : todayOrderCount}건
                      </Text>
                      <Text style={styles.todayLabel}>
                        {selectedSummary ? `${queryMonth}월 ${selectedDay}일 주문` : '오늘 주문'}
                      </Text>
                    </View>
                  </View>

                  {/* 월 조회 */}
                  <View style={styles.querySection}>
                    <View style={styles.queryRow}>
                      <View style={styles.monthPickerRow}>
                        <TouchableOpacity onPress={prevQueryMonth} style={styles.monthNavBtn} activeOpacity={0.7}>
                          <Ionicons name="chevron-back" size={18} color={Colors.gray600} />
                        </TouchableOpacity>
                        <Text style={styles.monthPickerText}>{queryYear}년 {queryMonth}월</Text>
                        <TouchableOpacity onPress={nextQueryMonth} style={styles.monthNavBtn} activeOpacity={0.7}>
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
                    {!loadingSummaries && monthTotal > 0 && (
                      <Text style={styles.sectionTotal}>{monthTotal.toLocaleString('ko-KR')}원</Text>
                    )}
                  </View>

                  {loadingSummaries
                    ? <LoadingSpinner fullScreen={false} />
                    : (
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
                        {selectedDay !== null && (
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
                        {selectedDay === null && summaries.length === 0 && (
                          <View style={styles.emptyState}>
                            <View style={styles.emptyIconBg}>
                              <Ionicons name="storefront-outline" size={26} color={Colors.gray400} />
                            </View>
                            <Text style={styles.emptyText}>이 달의 내역이 없어요</Text>
                            <Text style={styles.emptySubtext}>조회 버튼을 눌러 데이터를 불러오세요</Text>
                          </View>
                        )}
                      </>
                    )
                  }
                </ScrollView>
              );
            })()
          : (
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
              {/* ── 미연동: 신청 폼 ── */}
              {status === 'unregistered' && (
                <>
                  <View style={styles.infoCard}>
                    <Ionicons name="storefront-outline" size={28} color={Colors.primary} style={{ marginBottom: 10 }} />
                    <Text style={styles.infoTitle}>Toss Place POS 연동</Text>
                    <Text style={styles.infoDesc}>
                      가맹점 정보를 입력하면 POS 매출 데이터를{'\n'}자동으로 연동할 수 있어요.
                    </Text>
                  </View>

                  <Text style={styles.sectionTitle}>가맹점 신청</Text>
                  <View style={styles.card}>
                    <Text style={styles.fieldLabel}>가맹점명</Text>
                    <TextInput
                      style={styles.input}
                      value={storeName}
                      onChangeText={setStoreName}
                      placeholder="가맹점명"
                      placeholderTextColor={Colors.gray300}
                    />

                    <Text style={styles.fieldLabel}>대표자 연락처</Text>
                    <TextInput
                      style={styles.input}
                      value={ownerPhone}
                      onChangeText={setOwnerPhone}
                      placeholder="010-0000-0000"
                      placeholderTextColor={Colors.gray300}
                      keyboardType="phone-pad"
                    />

                    <Text style={styles.fieldLabel}>매장 주소</Text>
                    <TextInput
                      style={styles.input}
                      value={address}
                      onChangeText={setAddress}
                      placeholder="서울시 강남구 테헤란로 00"
                      placeholderTextColor={Colors.gray300}
                    />

                    <Text style={styles.fieldLabel}>사업자번호</Text>
                    <TextInput
                      style={styles.input}
                      value={businessNumber}
                      onChangeText={setBusinessNumber}
                      placeholder="000-00-00000"
                      placeholderTextColor={Colors.gray300}
                      keyboardType="numeric"
                    />

                    <TouchableOpacity
                      style={[styles.applyBtn, saving && styles.applyBtnDisabled]}
                      onPress={handleApply}
                      disabled={saving}
                    >
                      {saving
                        ? <ActivityIndicator size="small" color={Colors.white} />
                        : <Text style={styles.applyBtnText}>연동 신청하기</Text>
                      }
                    </TouchableOpacity>
                  </View>

                  <View style={styles.notice}>
                    <Ionicons name="information-circle-outline" size={16} color={Colors.gray400} />
                    <Text style={styles.noticeText}>
                      신청 후 1~3일 이내 토스 측에서 제공동의 전화 안내가 진행됩니다.
                    </Text>
                  </View>
                </>
              )}

              {/* ── 심사중 ── */}
              {status === 'pending' && (
                <View style={styles.pendingCard}>
                  <Ionicons name="time-outline" size={36} color={Colors.warning} style={{ alignSelf: 'center', marginBottom: 12 }} />
                  <Text style={styles.pendingTitle}>가맹점 신청 완료</Text>
                  <Text style={styles.pendingDesc}>
                    1~3일 이내 토스 측에서 제공동의 전화 안내 후 처리됩니다.{'\n'}
                    연동 완료 후 토스에서 가맹점 ID를 받으면 아래에 입력하세요.
                  </Text>
                  <TextInput
                    style={styles.merchantInput}
                    value={merchantId}
                    onChangeText={setMerchantId}
                    placeholder="가맹점 ID 입력"
                    placeholderTextColor={Colors.gray300}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity
                    style={[styles.checkBtn, saving && { opacity: 0.5 }]}
                    onPress={handleSaveMerchantId}
                    disabled={saving}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color={Colors.primary} />
                      : <Text style={styles.checkBtnText}>연동 완료</Text>
                    }
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )
      }
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.black, letterSpacing: -0.5 },
  lastSync: { fontSize: 12, color: Colors.gray400, marginTop: 3 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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

  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
  },
  statusConnected: { backgroundColor: Colors.success + '18' },
  statusPending: { backgroundColor: Colors.warning + '18' },
  statusDisconnected: { backgroundColor: Colors.gray100 },
  statusText: { fontSize: 12, fontWeight: '600' },
  statusTextConnected: { color: Colors.success },
  statusTextPending: { color: Colors.warning },
  statusTextDisconnected: { color: Colors.gray500 },

  scroll: { padding: 16, paddingBottom: 48 },

  infoCard: {
    backgroundColor: Colors.tinted,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  infoTitle: { fontSize: 16, fontWeight: '800', color: Colors.deeper, marginBottom: 8 },
  infoDesc: { fontSize: 13, color: Colors.dark, textAlign: 'center', lineHeight: 20 },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
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
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: Colors.gray100, marginBottom: 16,
  },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: Colors.black, backgroundColor: Colors.gray50,
  },
  applyBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginTop: 20,
  },
  applyBtnDisabled: { opacity: 0.5 },
  applyBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  notice: {
    flexDirection: 'row', gap: 8, padding: 14,
    backgroundColor: Colors.gray100, borderRadius: 12, marginBottom: 16,
  },
  noticeText: { flex: 1, fontSize: 13, color: Colors.gray500, lineHeight: 20 },

  pendingCard: {
    backgroundColor: Colors.white, borderRadius: 20,
    padding: 32, borderWidth: 1, borderColor: Colors.gray100,
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
    flexDirection: 'row',
    backgroundColor: Colors.tinted,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  todayCardItem: { flex: 1, alignItems: 'center', gap: 6 },
  todayDivider: { width: 1, backgroundColor: Colors.pale, marginVertical: 4 },
  todayIconBg: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.pale + '80',
    justifyContent: 'center', alignItems: 'center',
  },
  todayValue: { fontSize: 20, fontWeight: '800', color: Colors.deeper, letterSpacing: -0.5 },
  todayLabel: { fontSize: 12, color: Colors.dark, fontWeight: '500' },

  querySection: { marginBottom: 20 },
  queryRow: { flexDirection: 'row', gap: 10 },
  monthPickerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.gray200,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  monthNavBtn: {
    width: 28,
    height: 28,
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
    paddingHorizontal: 16, justifyContent: 'center',
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  dayCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
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

  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyIconBg: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: Colors.gray100, justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  emptyText: { fontSize: 15, fontWeight: '700', color: Colors.gray600, marginBottom: 4 },
  emptySubtext: { fontSize: 13, color: Colors.gray400 },

  // 캘린더
  calendarCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 0.5, borderColor: Colors.gray100,
    paddingHorizontal: 8, paddingVertical: 12, marginBottom: 12,
  },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500', color: Colors.gray400, paddingVertical: 4 },
  sundayText: { color: '#D94040' },
  saturdayText: { color: '#3A7FD4' },
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
    backgroundColor: Colors.white, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 0.5, borderColor: Colors.gray100,
  },
  selectedDayInfo: { gap: 3 },
  selectedDayDate: { fontSize: 15, fontWeight: '700', color: Colors.black },
  selectedDayCount: { fontSize: 12, color: Colors.gray500 },
  selectedDayRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectedDayAmount: { fontSize: 16, fontWeight: '800', color: Colors.primary, letterSpacing: -0.3 },
  selectedDayEmpty: {
    backgroundColor: Colors.white, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
    borderWidth: 0.5, borderColor: Colors.gray100,
  },
  selectedDayEmptyText: { fontSize: 14, color: Colors.gray400 },
});
