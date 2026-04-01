import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useTossSync } from '../../lib/hooks/useTossSync';
import { getStoreDetails, updateStoreInfo } from '../../lib/services/stores';
import { TossCatalogItem } from '../../types';

type SyncStatus = 'unregistered' | 'pending' | 'connected';

export default function PosSyncScreen() {
  const { store } = useAuth();
  const { loading, syncOrders, syncCatalog, loadTodaySales, todaySales, todayOrderCount } = useTossSync();

  const [status, setStatus] = useState<SyncStatus>('unregistered');
  const [storeName, setStoreName] = useState(store?.name ?? '');
  const [businessNumber, setBusinessNumber] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [catalogItems, setCatalogItems] = useState<TossCatalogItem[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);

  const loadStoreInfo = useCallback(async () => {
    if (!store) return;
    try {
      const data = await getStoreDetails(store.id);
      setStoreName(data.name ?? '');
      setBusinessNumber(data.business_number ?? '');
      setOwnerPhone(data.owner_phone ?? '');
      setAddress(data.address ?? '');

      if (data.toss_merchant_id) {
        setStatus('connected');
      } else if (data.business_number) {
        setStatus('pending');
      } else {
        setStatus('unregistered');
      }
    } catch {}
  }, [store]);

  useEffect(() => {
    loadStoreInfo();
  }, [loadStoreInfo]);

  useEffect(() => {
    if (status === 'connected') loadTodaySales();
  }, [status]);

  async function handleApply() {
    if (!store) return;
    if (!businessNumber.trim() || !ownerPhone.trim() || !address.trim()) {
      Alert.alert('입력 오류', '모든 항목을 입력해주세요.');
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
      setStatus('pending');
    } catch (e: any) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncOrders() {
    const today = new Date();
    const dateFrom = new Date(today.getFullYear(), today.getMonth(), 1)
      .toISOString().split('T')[0];
    const dateTo = today.toISOString().split('T')[0];
    try {
      const orders = await syncOrders(dateFrom, dateTo);
      await loadTodaySales();
      Alert.alert('동기화 완료', `${orders.length}건의 주문이 동기화되었습니다.`);
    } catch (e: any) {
      Alert.alert('동기화 실패', e.message);
    }
  }

  async function handleSyncCatalog() {
    try {
      const items = await syncCatalog();
      setCatalogItems(items);
      setShowCatalog(true);
    } catch (e: any) {
      Alert.alert('카탈로그 조회 실패', e.message);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>Toss Place POS 연동</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── 상태 배지 ── */}
        <View style={[
          styles.statusBadge,
          status === 'connected' ? styles.statusConnected
            : status === 'pending' ? styles.statusPending
            : styles.statusDisconnected,
        ]}>
          <Ionicons
            name={status === 'connected' ? 'checkmark-circle' : status === 'pending' ? 'time-outline' : 'ellipse-outline'}
            size={16}
            color={status === 'connected' ? Colors.success : status === 'pending' ? Colors.warning : Colors.gray400}
          />
          <Text style={[
            styles.statusText,
            status === 'connected' ? styles.statusTextConnected
              : status === 'pending' ? styles.statusTextPending
              : styles.statusTextDisconnected,
          ]}>
            {status === 'connected' ? '연동완료' : status === 'pending' ? '심사중' : '미연동'}
          </Text>
        </View>

        {/* ── 연동완료: 매출 + 동기화 ── */}
        {status === 'connected' && (
          <>
            <View style={styles.salesRow}>
              <View style={styles.salesCard}>
                <Text style={styles.salesLabel}>오늘 매출</Text>
                <Text style={styles.salesValue}>{todaySales.toLocaleString('ko-KR')}원</Text>
              </View>
              <View style={styles.salesCard}>
                <Text style={styles.salesLabel}>주문 건수</Text>
                <Text style={styles.salesValue}>{todayOrderCount}건</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>데이터 동기화</Text>
            <View style={styles.card}>
              <TouchableOpacity style={styles.syncBtn} onPress={handleSyncOrders} disabled={loading}>
                {loading
                  ? <ActivityIndicator size="small" color={Colors.primary} />
                  : <Ionicons name="sync-outline" size={18} color={Colors.primary} />}
                <View style={styles.syncBtnText}>
                  <Text style={styles.syncBtnTitle}>주문 데이터 동기화</Text>
                  <Text style={styles.syncBtnDesc}>이번 달 주문 내역을 가져옵니다</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity style={styles.syncBtn} onPress={handleSyncCatalog} disabled={loading}>
                <Ionicons name="restaurant-outline" size={18} color={Colors.primary} />
                <View style={styles.syncBtnText}>
                  <Text style={styles.syncBtnTitle}>메뉴 카탈로그 조회</Text>
                  <Text style={styles.syncBtnDesc}>POS 메뉴 목록과 레시피를 비교합니다</Text>
                </View>
              </TouchableOpacity>
            </View>

            {showCatalog && catalogItems.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>POS 메뉴 목록 ({catalogItems.length}개)</Text>
                <View style={styles.card}>
                  {catalogItems.map((item, idx) => (
                    <View key={item.itemId} style={[styles.catalogRow, idx > 0 && styles.catalogRowBorder]}>
                      <View style={styles.catalogLeft}>
                        <Text style={styles.catalogName}>{item.itemName}</Text>
                        <Text style={styles.catalogCategory}>{item.categoryName}</Text>
                      </View>
                      <View style={styles.catalogRight}>
                        <Text style={styles.catalogPrice}>{item.price.toLocaleString('ko-KR')}원</Text>
                        {!item.isAvailable && <Text style={styles.catalogUnavailable}>판매 중지</Text>}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        {/* ── 심사중 안내 ── */}
        {status === 'pending' && (
          <View style={styles.pendingCard}>
            <Ionicons name="time-outline" size={32} color={Colors.warning} style={{ marginBottom: 12 }} />
            <Text style={styles.pendingTitle}>가맹점 신청 완료</Text>
            <Text style={styles.pendingDesc}>
              1~3일 이내 토스 측에서 제공동의 전화 안내 후 처리됩니다.{'\n'}
              연동 완료 후 이 화면에서 매출 데이터를 동기화할 수 있습니다.
            </Text>
          </View>
        )}

        {/* ── 미연동: 신청 폼 ── */}
        {status === 'unregistered' && (
          <>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  scroll: { padding: 20, paddingBottom: 48 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, marginBottom: 24,
  },
  statusConnected: { backgroundColor: Colors.success + '18' },
  statusPending: { backgroundColor: Colors.warning + '18' },
  statusDisconnected: { backgroundColor: Colors.gray100 },
  statusText: { fontSize: 13, fontWeight: '600' },
  statusTextConnected: { color: Colors.success },
  statusTextPending: { color: Colors.warning },
  statusTextDisconnected: { color: Colors.gray500 },
  salesRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  salesCard: {
    flex: 1, backgroundColor: Colors.white, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: Colors.gray100,
  },
  salesLabel: { fontSize: 12, color: Colors.gray500, marginBottom: 4 },
  salesValue: { fontSize: 20, fontWeight: '800', color: Colors.black },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.black, marginBottom: 10 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: Colors.gray100, marginBottom: 24,
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
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  syncBtnText: { flex: 1 },
  syncBtnTitle: { fontSize: 14, fontWeight: '600', color: Colors.black },
  syncBtnDesc: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.gray100, marginVertical: 12 },
  pendingCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 24, borderWidth: 1, borderColor: Colors.gray100,
    alignItems: 'center', marginBottom: 24,
  },
  pendingTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 8 },
  pendingDesc: { fontSize: 14, color: Colors.gray500, textAlign: 'center', lineHeight: 22 },
  catalogRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  catalogRowBorder: { borderTopWidth: 1, borderTopColor: Colors.gray100 },
  catalogLeft: { flex: 1 },
  catalogName: { fontSize: 14, fontWeight: '600', color: Colors.black },
  catalogCategory: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  catalogRight: { alignItems: 'flex-end' },
  catalogPrice: { fontSize: 14, fontWeight: '700', color: Colors.black },
  catalogUnavailable: { fontSize: 11, color: Colors.warning, marginTop: 2 },
  notice: {
    flexDirection: 'row', gap: 8, padding: 14,
    backgroundColor: Colors.gray100, borderRadius: 12,
  },
  noticeText: { flex: 1, fontSize: 13, color: Colors.gray500, lineHeight: 20 },
});
