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
import { supabase } from '../../lib/supabase';
import { TossCatalogItem } from '../../types';

export default function PosSyncScreen() {
  const { store, refreshStore } = useAuth();
  const { loading, error, syncOrders, syncCatalog, loadTodaySales, todaySales, todayOrderCount } = useTossSync();

  const [merchantId, setMerchantId] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [catalogItems, setCatalogItems] = useState<TossCatalogItem[]>([]);
  const [showCatalog, setShowCatalog] = useState(false);

  useEffect(() => {
    if (!store) return;
    supabase
      .from('stores')
      .select('toss_merchant_id, toss_access_key, toss_secret_key')
      .eq('id', store.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setMerchantId(data.toss_merchant_id ?? '');
          setAccessKey(data.toss_access_key ?? '');
          setSecretKey(data.toss_secret_key ?? '');
        }
      });
    loadTodaySales();
  }, [store]);

  const isConnected = Boolean(merchantId);

  async function handleSave() {
    if (!store) return;
    if (!merchantId.trim() || !accessKey.trim() || !secretKey.trim()) {
      Alert.alert('입력 오류', '모든 항목을 입력해주세요.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('stores')
      .update({
        toss_merchant_id: merchantId.trim(),
        toss_access_key: accessKey.trim(),
        toss_secret_key: secretKey.trim(),
      })
      .eq('id', store.id);
    setSaving(false);

    if (error) {
      Alert.alert('저장 실패', error.message);
    } else {
      await refreshStore();
      Alert.alert('저장 완료', 'Toss Place 연동 정보가 저장되었습니다.');
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
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>Toss Place POS 연동</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 연동 상태 배지 */}
        <View style={[styles.statusBadge, isConnected ? styles.statusConnected : styles.statusDisconnected]}>
          <Ionicons
            name={isConnected ? 'checkmark-circle' : 'ellipse-outline'}
            size={16}
            color={isConnected ? Colors.success : Colors.gray400}
          />
          <Text style={[styles.statusText, isConnected ? styles.statusTextConnected : styles.statusTextDisconnected]}>
            {isConnected ? '연동됨' : '미연동'}
          </Text>
        </View>

        {/* 오늘 매출 (연동 시에만) */}
        {isConnected && (
          <View style={styles.salesRow}>
            <View style={styles.salesCard}>
              <Text style={styles.salesLabel}>오늘 매출</Text>
              <Text style={styles.salesValue}>
                {todaySales.toLocaleString('ko-KR')}원
              </Text>
            </View>
            <View style={styles.salesCard}>
              <Text style={styles.salesLabel}>주문 건수</Text>
              <Text style={styles.salesValue}>{todayOrderCount}건</Text>
            </View>
          </View>
        )}

        {/* 자격증명 입력 */}
        <Text style={styles.sectionTitle}>연동 정보</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>가맹점 ID (Merchant ID)</Text>
          <TextInput
            style={styles.input}
            value={merchantId}
            onChangeText={setMerchantId}
            placeholder="사업자 등록 후 발급"
            placeholderTextColor={Colors.gray300}
            autoCapitalize="none"
          />
          <Text style={styles.fieldLabel}>Access Key</Text>
          <TextInput
            style={styles.input}
            value={accessKey}
            onChangeText={setAccessKey}
            placeholder="Toss Place 개발자 콘솔에서 발급"
            placeholderTextColor={Colors.gray300}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.fieldLabel}>Secret Key</Text>
          <TextInput
            style={styles.input}
            value={secretKey}
            onChangeText={setSecretKey}
            placeholder="Toss Place 개발자 콘솔에서 발급"
            placeholderTextColor={Colors.gray300}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Text style={styles.saveBtnText}>저장</Text>
            }
          </TouchableOpacity>
        </View>

        {/* 동기화 액션 (연동 후에만 활성화) */}
        <Text style={styles.sectionTitle}>데이터 동기화</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.syncBtn, !isConnected && styles.syncBtnDisabled]}
            onPress={handleSyncOrders}
            disabled={!isConnected || loading}
          >
            {loading
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="sync-outline" size={18} color={isConnected ? Colors.primary : Colors.gray300} />
            }
            <View style={styles.syncBtnText}>
              <Text style={[styles.syncBtnTitle, !isConnected && styles.syncBtnTitleDisabled]}>
                주문 데이터 동기화
              </Text>
              <Text style={styles.syncBtnDesc}>이번 달 주문 내역을 가져옵니다</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={[styles.syncBtn, !isConnected && styles.syncBtnDisabled]}
            onPress={handleSyncCatalog}
            disabled={!isConnected || loading}
          >
            <Ionicons name="restaurant-outline" size={18} color={isConnected ? Colors.primary : Colors.gray300} />
            <View style={styles.syncBtnText}>
              <Text style={[styles.syncBtnTitle, !isConnected && styles.syncBtnTitleDisabled]}>
                메뉴 카탈로그 조회
              </Text>
              <Text style={styles.syncBtnDesc}>POS 메뉴 목록과 레시피를 비교합니다</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 카탈로그 결과 */}
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
                    <Text style={styles.catalogPrice}>
                      {item.price.toLocaleString('ko-KR')}원
                    </Text>
                    {!item.isAvailable && (
                      <Text style={styles.catalogUnavailable}>판매 중지</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* 안내 */}
        {!isConnected && (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.gray400} />
            <Text style={styles.noticeText}>
              Toss Place 개발자 계정 생성 시 사업자번호가 필요합니다.{'\n'}
              연동 정보를 미리 입력해두면 등록 후 바로 사용할 수 있습니다.
            </Text>
          </View>
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
    borderRadius: 20, marginBottom: 20,
  },
  statusConnected: { backgroundColor: Colors.success + '15' },
  statusDisconnected: { backgroundColor: Colors.gray100 },
  statusText: { fontSize: 13, fontWeight: '600' },
  statusTextConnected: { color: Colors.success },
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
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', marginTop: 20,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  syncBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  syncBtnDisabled: { opacity: 0.4 },
  syncBtnText: { flex: 1 },
  syncBtnTitle: { fontSize: 14, fontWeight: '600', color: Colors.black },
  syncBtnTitleDisabled: { color: Colors.gray400 },
  syncBtnDesc: { fontSize: 12, color: Colors.gray400, marginTop: 2 },
  divider: { height: 1, backgroundColor: Colors.gray100, marginVertical: 12 },
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
