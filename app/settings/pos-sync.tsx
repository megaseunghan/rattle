import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { getStoreDetails } from '../../lib/services/stores';

// Rattle 공용 서비스코드 (토스 개발자센터 등록값)
const SERVICE_CODE = 'BVH3TUFV';
// 대기중일 때 자동 재조회 간격
const POLL_INTERVAL_MS = 5000;

type SyncStatus = 'connected' | 'waiting';

export default function PosSyncScreen() {
  const { store } = useAuth();

  const [status, setStatus] = useState<SyncStatus>('waiting');
  const [merchantId, setMerchantId] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!store) return;
    try {
      const data = await getStoreDetails(store.id);
      const connected = !!data.toss_merchant_id;
      setStatus(connected ? 'connected' : 'waiting');
      setMerchantId(data.toss_merchant_id ?? '');
    } catch {}
  }, [store]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // 연동 대기중에는 자동 폴링 → 웹훅으로 자동매칭되면 '연동완료' 자동 전환
  useEffect(() => {
    if (status === 'waiting') {
      pollRef.current = setInterval(load, POLL_INTERVAL_MS);
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [status, load]);

  function copyServiceCode() {
    Clipboard.setString(SERVICE_CODE);
    Alert.alert('복사됨', `서비스코드 ${SERVICE_CODE}를 복사했어요.`);
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
        {status === 'connected' ? (
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
                  <Text style={styles.waitingDesc}>포스에서 연결하면 자동으로 완료 상태로 바뀝니다.</Text>
                </View>
              </View>
            </View>
            <Text style={styles.noticeText}>
              사업자번호로 연결되므로 Rattle에 따로 입력할 내용은 없어요. 반영이 늦으면 이 화면을 다시 열어주세요.
            </Text>
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

  // 연동완료
  connectedCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 20, borderWidth: 1, borderColor: Colors.gray100,
    alignItems: 'flex-start',
  },
  connectedStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  connectedStatusText: { fontSize: 13, fontWeight: '700', color: Colors.success },
  connectedTitle: { fontSize: 16, fontWeight: '700', color: Colors.black, marginBottom: 8 },
  connectedDesc: { fontSize: 14, color: Colors.gray500, lineHeight: 22, marginBottom: 20 },
  goToPosBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  goToPosBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  // 서비스코드
  sectionTitle: { fontSize: 20, fontWeight: '700', color: Colors.black, marginBottom: 6 },
  sectionDesc: { fontSize: 14, color: Colors.gray600, lineHeight: 21, marginBottom: 20 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 20, borderWidth: 1, borderColor: Colors.gray100, marginBottom: 16,
  },
  codeLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 10 },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.gray50, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.gray200,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  codeText: { fontSize: 24, fontWeight: '800', color: Colors.black, letterSpacing: 2 },
  waitingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderTopWidth: 1, borderTopColor: Colors.gray100,
    marginTop: 20, paddingTop: 18,
  },
  waitingCopy: { flex: 1, gap: 3 },
  waitingTitle: { fontSize: 14, fontWeight: '700', color: Colors.black },
  waitingDesc: { fontSize: 13, color: Colors.gray500, lineHeight: 19 },
  noticeText: { fontSize: 13, color: Colors.gray500, lineHeight: 20 },
});
