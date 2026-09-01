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
        {/* ── 상태 배지 ── */}
        <View style={[styles.statusBadge, status === 'connected' ? styles.statusConnected : styles.statusPending]}>
          <Ionicons
            name={status === 'connected' ? 'checkmark-circle' : 'time-outline'}
            size={16}
            color={status === 'connected' ? Colors.success : Colors.warning}
          />
          <Text style={[styles.statusText, status === 'connected' ? styles.statusTextConnected : styles.statusTextPending]}>
            {status === 'connected' ? '연동완료' : '연동 대기중'}
          </Text>
        </View>

        {status === 'connected' ? (
          /* ── 연동완료 ── */
          <View style={styles.connectedCard}>
            <Ionicons name="checkmark-circle" size={32} color={Colors.success} style={{ marginBottom: 12 }} />
            <Text style={styles.connectedTitle}>POS 연동이 완료되었습니다</Text>
            <Text style={styles.connectedDesc}>
              가맹점 ID: {merchantId}{'\n'}
              매출 데이터는 POS 탭에서 확인할 수 있어요.
            </Text>
            <TouchableOpacity style={styles.goToPosBtn} onPress={() => router.push('/(tabs)/pos')}>
              <Text style={styles.goToPosBtnText}>POS 탭으로 이동</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.white} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── 1. 서비스코드 안내 ── */}
            <Text style={styles.sectionTitle}>1. 포스에서 서비스코드 입력</Text>
            <View style={styles.card}>
              <Text style={styles.codeLabel}>Rattle 서비스코드</Text>
              <TouchableOpacity style={styles.codeBox} onPress={copyServiceCode} activeOpacity={0.7}>
                <Text style={styles.codeText}>{SERVICE_CODE}</Text>
                <Ionicons name="copy-outline" size={18} color={Colors.primary} />
              </TouchableOpacity>
              <View style={styles.steps}>
                <Text style={styles.stepText}>① 토스 포스에서 <Text style={styles.stepBold}>설정 &gt; 서비스 연동</Text> 이동</Text>
                <Text style={styles.stepText}>② 위 서비스코드 <Text style={styles.stepBold}>{SERVICE_CODE}</Text> 입력</Text>
                <Text style={styles.stepText}>③ 연결하면 <Text style={styles.stepBold}>자동으로 연동완료</Text>됩니다</Text>
              </View>
            </View>

            {/* ── 자동 연동 대기 안내 ── */}
            <View style={styles.waitingCard}>
              <ActivityIndicator size="small" color={Colors.warning} style={{ marginBottom: 10 }} />
              <Text style={styles.waitingTitle}>연동을 기다리는 중이에요</Text>
              <Text style={styles.waitingDesc}>
                포스에서 서비스코드를 입력하면{'\n'}이 화면이 자동으로 연동완료로 바뀝니다.
              </Text>
            </View>

            <View style={styles.notice}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.gray400} />
              <Text style={styles.noticeText}>
                사업자번호로 자동 연결되므로 별도 입력은 필요 없어요. 반영이 늦으면 이 화면을 다시 열어주세요.
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
  statusText: { fontSize: 13, fontWeight: '600' },
  statusTextConnected: { color: Colors.success },
  statusTextPending: { color: Colors.warning },

  // 연동완료
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

  // 서비스코드
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.black, marginBottom: 10 },
  card: {
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: Colors.gray100, marginBottom: 24,
  },
  codeLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 8 },
  codeBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.primary + '10', borderRadius: 10,
    borderWidth: 1, borderColor: Colors.primary + '40',
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 16,
  },
  codeText: { fontSize: 22, fontWeight: '800', color: Colors.primary, letterSpacing: 2 },
  steps: { gap: 8 },
  stepText: { fontSize: 13, color: Colors.gray600, lineHeight: 20 },
  stepBold: { fontWeight: '700', color: Colors.black },

  // 자동 연동 대기
  waitingCard: {
    backgroundColor: Colors.white, borderRadius: 14,
    padding: 24, borderWidth: 1, borderColor: Colors.gray100,
    alignItems: 'center', marginBottom: 12,
  },
  waitingTitle: { fontSize: 15, fontWeight: '700', color: Colors.black, marginBottom: 6 },
  waitingDesc: { fontSize: 13, color: Colors.gray500, textAlign: 'center', lineHeight: 20 },

  notice: {
    flexDirection: 'row', gap: 8, padding: 14, marginTop: 12,
    backgroundColor: Colors.gray100, borderRadius: 12,
  },
  noticeText: { flex: 1, fontSize: 13, color: Colors.gray500, lineHeight: 20 },
});
