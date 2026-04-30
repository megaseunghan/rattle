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
import { getStoreDetails, updateStoreInfo } from '../../lib/services/stores';
import { submitTossPlaceApplication } from '../../lib/services/tossPlaceForm';

type SyncStatus = 'unregistered' | 'pending' | 'connected';

export default function PosSyncScreen() {
  const { store } = useAuth();

  const [status, setStatus] = useState<SyncStatus>('unregistered');
  const [storeName, setStoreName] = useState(store?.name ?? '');
  const [businessNumber, setBusinessNumber] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [saving, setSaving] = useState(false);

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

  async function handleSaveMerchantId() {
    if (!store) return;
    const trimmed = merchantId.trim();
    if (!trimmed) {
      Alert.alert('입력 오류', '가맹점 ID를 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await updateStoreInfo(store.id, { toss_merchant_id: trimmed });
      setStatus('connected');
    } catch (e: any) {
      Alert.alert('저장 실패', e.message);
    } finally {
      setSaving(false);
    }
  }

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

        {/* ── 연동완료: POS 탭 안내 ── */}
        {status === 'connected' && (
          <View style={styles.connectedCard}>
            <Ionicons name="checkmark-circle" size={32} color={Colors.success} style={{ marginBottom: 12 }} />
            <Text style={styles.connectedTitle}>POS 연동이 완료되었습니다</Text>
            <Text style={styles.connectedDesc}>
              매출 데이터는 POS 탭에서 확인할 수 있어요.
            </Text>
            <TouchableOpacity
              style={styles.goToPosBtn}
              onPress={() => router.push('/(tabs)/pos')}
            >
              <Text style={styles.goToPosBtnText}>POS 탭으로 이동</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.white} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── 심사중 안내 ── */}
        {status === 'pending' && (
          <View style={styles.pendingCard}>
            <Ionicons name="time-outline" size={32} color={Colors.warning} style={{ marginBottom: 12 }} />
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

  // 연동완료 카드
  connectedCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 24, borderWidth: 1, borderColor: Colors.gray100,
    alignItems: 'center', marginBottom: 24,
  },
  connectedTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 8 },
  connectedDesc: { fontSize: 14, color: Colors.gray500, textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  goToPosBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  goToPosBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  // 심사중
  pendingCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 24, borderWidth: 1, borderColor: Colors.gray100,
    alignItems: 'center', marginBottom: 24,
  },
  pendingTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 8 },
  pendingDesc: { fontSize: 14, color: Colors.gray500, textAlign: 'center', lineHeight: 22 },
  merchantInput: {
    alignSelf: 'stretch', marginTop: 16,
    borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    color: Colors.black, backgroundColor: Colors.gray50,
  },
  checkBtn: {
    marginTop: 12, paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 10, borderWidth: 1, borderColor: Colors.primary,
  },
  checkBtnText: { fontSize: 14, fontWeight: '600', color: Colors.primary },

  // 신청 폼
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
  notice: {
    flexDirection: 'row', gap: 8, padding: 14,
    backgroundColor: Colors.gray100, borderRadius: 12,
  },
  noticeText: { flex: 1, fontSize: 13, color: Colors.gray500, lineHeight: 20 },
});
