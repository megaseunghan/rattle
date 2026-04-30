import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, Modal, Platform, TextInput,
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
import { getStoreDetails, updateStoreInfo } from '../../lib/services/stores';
import { submitTossPlaceApplication } from '../../lib/services/tossPlaceForm';
import { DailySummary } from '../../types';

type SyncStatus = 'unregistered' | 'pending' | 'connected';

function SummaryCard({ summary, onPress }: { summary: DailySummary; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.dayCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.dayCardLeft}>
        <Text style={styles.dayCardDate}>{summary.date}</Text>
        <Text style={styles.dayCardCount}>{summary.orderCount}건</Text>
      </View>
      <View style={styles.dayCardRight}>
        <Text style={styles.dayCardAmount}>{summary.totalAmount.toLocaleString('ko-KR')}원</Text>
        <View style={styles.dayCardChevron}>
          <Ionicons name="chevron-forward" size={14} color={Colors.gray400} />
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function PosScreen() {
  const { store } = useAuth();
  const {
    lastSyncAt, todaySales, todayOrderCount,
    loadTodaySales, syncByDate, autoSyncing,
  } = useTossSync();
  const { summaries, loadingSummaries, loadingMoreSummaries, hasMoreSummaries, fetchSummaries, loadMoreSummaries } = usePosAnalytics();

  const [status, setStatus] = useState<SyncStatus>('unregistered');
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [storeName, setStoreName] = useState(store?.name ?? '');
  const [businessNumber, setBusinessNumber] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const [merchantId, setMerchantId] = useState('');

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
        loadTodaySales();
        fetchSummaries(closingTime);
      }
    } catch {}
    setLoadingStatus(false);
  }, [store, loadTodaySales, fetchSummaries, closingTime]);

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
      fetchSummaries(closingTime);
    } catch (e: any) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSaving(false);
    }
  }

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
          ? (
            <FlatList
              data={summaries}
              keyExtractor={s => s.date}
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={(
                <>
                  {/* 오늘 요약 */}
                  <View style={styles.todayCard}>
                    <View style={styles.todayCardItem}>
                      <View style={styles.todayIconBg}>
                        <Ionicons name="cash-outline" size={20} color={Colors.dark} />
                      </View>
                      <Text style={styles.todayValue}>{todaySales.toLocaleString('ko-KR')}원</Text>
                      <Text style={styles.todayLabel}>오늘 매출</Text>
                    </View>
                    <View style={styles.todayDivider} />
                    <View style={styles.todayCardItem}>
                      <View style={styles.todayIconBg}>
                        <Ionicons name="receipt-outline" size={20} color={Colors.dark} />
                      </View>
                      <Text style={styles.todayValue}>{todayOrderCount}건</Text>
                      <Text style={styles.todayLabel}>오늘 주문</Text>
                    </View>
                  </View>

                  {/* 날짜 조회 */}
                  <View style={styles.querySection}>
                    <Text style={styles.sectionTitle}>날짜 조회</Text>
                    <View style={styles.queryRow}>
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
                          : <>
                              <Ionicons name="search-outline" size={15} color={Colors.white} />
                              <Text style={styles.syncBtnText}>조회</Text>
                            </>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* DateTimePicker */}
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
                          <View style={styles.pickerHandle} />
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

                  <Text style={styles.sectionTitle}>최근 영업 내역</Text>
                  {loadingSummaries && <LoadingSpinner fullScreen={false} />}
                </>
              )}
              renderItem={({ item: s }) => (
                <SummaryCard
                  summary={s}
                  onPress={() => router.push(`/pos/${s.date}?from=${encodeURIComponent(s.dateFrom)}&to=${encodeURIComponent(s.dateTo)}`)}
                />
              )}
              ListEmptyComponent={!loadingSummaries ? (
                <View style={styles.emptyState}>
                  <View style={styles.emptyIconBg}>
                    <Ionicons name="storefront-outline" size={26} color={Colors.gray400} />
                  </View>
                  <Text style={styles.emptyText}>동기화된 내역이 없어요</Text>
                  <Text style={styles.emptySubtext}>날짜를 선택해 동기화해보세요</Text>
                </View>
              ) : null}
              onEndReached={hasMoreSummaries ? () => loadMoreSummaries(closingTime) : undefined}
              onEndReachedThreshold={0.5}
              ListFooterComponent={loadingMoreSummaries ? <ActivityIndicator style={{ padding: 16 }} color={Colors.primary} /> : null}
            />
          )
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

  // 상태 배지
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

  // 미연동 안내 카드
  infoCard: {
    backgroundColor: Colors.tinted,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  infoTitle: { fontSize: 16, fontWeight: '800', color: Colors.deeper, marginBottom: 8 },
  infoDesc: { fontSize: 13, color: Colors.dark, textAlign: 'center', lineHeight: 20 },

  // 신청 폼
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.black,
    marginBottom: 10,
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

  // 심사중
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

  // 연동완료: 오늘 카드
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

  // 날짜 조회
  querySection: { marginBottom: 20 },
  queryRow: { flexDirection: 'row', gap: 10 },
  datePickerBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.gray200,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  datePickerText: { fontSize: 15, color: Colors.black, fontWeight: '500' },
  syncBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 16, justifyContent: 'center',
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },

  // 일별 카드
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

  // 빈 상태
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyIconBg: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: Colors.gray100, justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  emptyText: { fontSize: 15, fontWeight: '700', color: Colors.gray600, marginBottom: 4 },
  emptySubtext: { fontSize: 13, color: Colors.gray400 },

  // 날짜 피커 모달
  modalOverlay: {
    flex: 1, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  pickerContainer: {
    backgroundColor: Colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 16, paddingTop: 10,
  },
  pickerHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.gray200, alignSelf: 'center', marginBottom: 8,
  },
});
