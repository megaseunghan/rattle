/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocalSearchParams, useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { Button } from '../../lib/components/ui';
import { Fonts } from '../../constants/fonts';
import { getStoreDetails } from '../../lib/services/stores';

// Rattle 공용 서비스코드 (토스 개발자센터 등록값)
const SERVICE_CODE = 'BVH3TUFV';
// 대기중일 때 자동 재조회 간격
const POLL_INTERVAL_MS = 5000;

type SyncStatus = 'connected' | 'waiting';

export default function PosSyncScreen() {
  const { store, currentRole } = useAuth();
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const leave = () => setup === '1' ? router.replace('/(tabs)') : router.back();

  const [status, setStatus] = useState<SyncStatus>('waiting');
  const [loadError, setLoadError] = useState(false);
  const [checkedStoreId, setCheckedStoreId] = useState<string>();
  const currentStoreId = useRef(store?.id);
  currentStoreId.current = store?.id;
  const loadRequest = useRef(0);
  const inFlightStore = useRef<string | null>(null);
  const [merchantId, setMerchantId] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!store || currentRole !== 'admin') return;
    if (inFlightStore.current === store.id) return;
    inFlightStore.current = store.id;
    const request = ++loadRequest.current;
    const id = store.id;
    setLoadError(false);
    try {
      const data = await getStoreDetails(id);
      if (request !== loadRequest.current || id !== currentStoreId.current) return;
      const connected = !!data.toss_merchant_id;
      setLoadError(false);
      setStatus(connected ? 'connected' : 'waiting');
      setMerchantId(data.toss_merchant_id ?? '');
      setCheckedStoreId(id);
    } catch { if (request === loadRequest.current && id === currentStoreId.current) setLoadError(true); }
    finally { if (request === loadRequest.current) inFlightStore.current = null; }
  }, [store, currentRole]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadRequest.current += 1; inFlightStore.current = null; };
  }, [load]));

  // 연동 대기중에는 자동 폴링 → 웹훅으로 자동매칭되면 '연동완료' 자동 전환
  useFocusEffect(useCallback(() => {
    if (status === 'waiting') {
      pollRef.current = setInterval(load, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [status, load]));

  function copyServiceCode() {
    Clipboard.setString(SERVICE_CODE);
    Alert.alert('복사됨', `서비스코드 ${SERVICE_CODE}를 복사했어요.`);
  }

  if (currentRole !== 'admin') return <SafeAreaView><Text>관리자만 POS 연결을 설정할 수 있어요.</Text></SafeAreaView>;
  const checking = checkedStoreId !== store?.id;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={leave} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="뒤로가기">
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>Toss Place POS 연동</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.storeContext}><Text style={styles.storeLabel}>연결할 매장</Text><Text style={styles.storeName}>{store?.name ?? '매장 확인 필요'}</Text></View>
        {loadError && <Text style={{ color: Colors.gray600, paddingBottom: 16 }}>연결 상태를 확인하지 못했어요. 잠시 후 다시 확인할게요.</Text>}
        {checking ? <View style={styles.card}><Text style={styles.sectionTitle}>{loadError ? '연결 상태 확인 필요' : '연결 상태를 확인하고 있어요'}</Text>{loadError ? <Button label="다시 확인" variant="secondary" onPress={() => { void load(); }} /> : <ActivityIndicator color={Colors.action} />}</View> : status === 'connected' ? (
          /* ── 연동완료 ── */
          <View style={styles.connectedCard}>
            <View style={styles.connectedStatus}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.connectedStatusText}>연동완료</Text>
            </View>
            <Text style={styles.connectedTitle}>POS 연동이 완료되었습니다</Text>
            <Text style={styles.connectedDesc}>
              가맹점 ID: {merchantId}{'\n'}
              매출 데이터는 매출 탭에서 확인할 수 있어요.
            </Text>
            <TouchableOpacity style={styles.goToPosBtn} onPress={() => router.push('/pos')}>
              <Text style={styles.goToPosBtnText}>매출 확인</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>포스에서 서비스코드를 입력하세요</Text>
            <Text style={styles.sectionDesc}>토스 포스의 설정 &gt; 서비스 연동에서 사용합니다.</Text>
            <View style={styles.card}>
              <Text style={styles.codeLabel}>Rattle 서비스코드 · 눌러서 복사</Text>
              <TouchableOpacity style={styles.codeBox} onPress={copyServiceCode} activeOpacity={0.7}>
                <Text style={styles.codeText}>{SERVICE_CODE}</Text>
                <Ionicons name="copy-outline" size={18} color={Colors.primary} />
              </TouchableOpacity>
              <View style={styles.waitingRow}>
                <ActivityIndicator size="small" color={Colors.gray500} />
                <View style={styles.waitingCopy}>
                  <Text style={styles.waitingTitle}>연동 대기중</Text>
                  <Text style={styles.waitingDesc}>이 매장의 계정 연결이 확인되면 완료 상태로 바뀌어요.</Text>
                </View>
              </View>
            </View>
            <Text style={styles.noticeText}>
              서비스 연결과 Rattle 매장 연결 확인은 별도예요. 연결이 확인되기 전에는 매출을 가져오지 않아요. 지금 완료하지 않아도 매장을 사용할 수 있어요.
            </Text>
          </>
        )}
      </ScrollView>
      {setup === '1' && <View style={styles.setupFooter}><Text style={styles.footerHint}>{!checking && status === 'connected' ? '연결이 확인됐어요. 매장으로 이동할 수 있어요.' : '지금 연결하지 않아도 매장을 사용할 수 있어요.'}</Text><Button label={!checking && status === 'connected' ? '매장 시작하기' : '나중에 연결하고 시작하기'} onPress={leave} /></View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  storeContext: { backgroundColor: Colors.contextBg, borderRadius: 16, padding: 16, gap: 6, marginBottom: 20 }, storeLabel: { fontSize: 12, color: Colors.gray600 }, storeName: { fontSize: 16, color: Colors.black, fontWeight: '700' },
  setupFooter: { padding: 20, gap: 10, borderTopWidth: 1, borderTopColor: Colors.homeBorder, backgroundColor: Colors.white }, footerHint: { fontSize: 13, lineHeight: 20, color: Colors.gray600 },
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
  },
  backBtn: { width: 44, height: 44, justifyContent: 'center' },
  title: { flexShrink: 1, fontSize: 22, fontWeight: '700', color: Colors.black },
  scroll: { padding: 20, paddingBottom: 48 },

  // 연동완료
  connectedCard: {
    backgroundColor: Colors.white, borderRadius: 24,
    padding: 20, borderWidth: 1, borderColor: Colors.homeBorder,
    alignItems: 'flex-start',
  },
  connectedStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  connectedStatusText: { fontSize: 13, fontWeight: '700', color: Colors.success },
  connectedTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 8 },
  connectedDesc: { fontSize: 14, color: Colors.gray500, lineHeight: 22, marginBottom: 20 },
  goToPosBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.action, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12, minHeight: 44,
  },
  goToPosBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  // 서비스코드
  sectionTitle: { fontSize: 20, fontWeight: '700', color: Colors.black, marginBottom: 6 },
  sectionDesc: { fontSize: 14, color: Colors.gray600, lineHeight: 21, marginBottom: 20 },
  card: {
    backgroundColor: Colors.white, borderRadius: 20,
    padding: 20, borderWidth: 1, borderColor: Colors.homeBorder, marginBottom: 16,
  },
  codeLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 10 },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.gray50, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.gray200,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  codeText: { fontFamily: Fonts.geistBold, fontVariant: ['tabular-nums'], fontSize: 24, fontWeight: '700', color: Colors.black, letterSpacing: 2 },
  waitingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopWidth: 1, borderTopColor: Colors.homeBorder,
    marginTop: 20, paddingTop: 18,
  },
  waitingCopy: { flex: 1, gap: 3 },
  waitingTitle: { fontSize: 14, fontWeight: '700', color: Colors.black },
  waitingDesc: { fontSize: 13, color: Colors.gray500, lineHeight: 19 },
  noticeText: { fontSize: 13, color: Colors.gray500, lineHeight: 20 },
});
