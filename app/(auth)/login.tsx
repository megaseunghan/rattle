import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { signInWithSocialProvider, SocialProvider } from '../../lib/services/socialAuth';
import { Colors } from '../../constants/colors';
import { Type } from '../../constants/designTokens';
import { Button } from '../../lib/components/ui';
import { isQaLoginEnabled, signInForQa, getInitialQaRole, QaRole } from '../../lib/services/qaLogin';
import { getErrorMessage } from '../../lib/utils/error';

export default function LoginScreen() {
  const [loading, setLoading] = useState<SocialProvider | QaRole | null>(null);
  const busy = useRef(false);
  const { qaRole } = useLocalSearchParams<{ qaRole?: string }>();
  const autoQaAttempted = useRef(false);
  useEffect(() => {
    if (autoQaAttempted.current || !isQaLoginEnabled()) return;
    autoQaAttempted.current = true;
    let mounted = true;
    void (async () => {
      try {
        const role = ['admin', 'regular', 'part_time'].includes(qaRole ?? '') ? qaRole as QaRole : await getInitialQaRole();
        if (mounted && role) await handleQaLogin(role);
      } catch { if (mounted) Alert.alert('테스트 로그인', '아래에서 역할을 선택해주세요.'); }
    })();
    return () => { mounted = false; };
  }, [qaRole]);

  async function handleLogin(provider: SocialProvider) {
    if (busy.current) return;
    busy.current = true;
    setLoading(provider);
    try {
      await signInWithSocialProvider(provider);
      // AuthContext의 onAuthStateChange가 이후 라우팅을 처리함
    } catch {
      const name = { kakao: '카카오', google: 'Google', apple: 'Apple' }[provider];
      Alert.alert('로그인 확인', `${name} 로그인을 완료하지 못했어요. 다시 시도해주세요.`);
    } finally {
      busy.current = false;
      setLoading(null);
    }
  }

  async function handleQaLogin(role: QaRole) {
    if (busy.current) return;
    busy.current = true;
    setLoading(role);
    try { await signInForQa(role); }
    catch (error) { Alert.alert('테스트 로그인', getErrorMessage(error, '로컬 테스트 로그인 서버를 실행해주세요.')); }
    finally { busy.current = false; setLoading(null); }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.inner} showsVerticalScrollIndicator={false}>
        {/* 로고 영역 */}
        <View style={styles.logoArea}>
          <Text style={styles.logoR}>R</Text>
          <Text style={styles.logoAttle}>attle</Text>
          <View style={styles.logoDot} />
        </View>

        <Text style={styles.headline}>매장별 매출부터 손익까지</Text>
        <Text style={styles.subheadline}>매출·매입·인건비를 모아{'\n'}이번 달 매장 손익을 확인하세요.</Text>

        <View style={styles.buttonWrap}>
          <Button
            label="카카오로 시작하기"
            variant="kakao"
            onPress={() => handleLogin('kakao')}
            loading={loading === 'kakao'}
            disabled={loading !== null}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Google로 계속하기"
            accessibilityState={{ disabled: loading !== null, busy: loading === 'google' }}
            disabled={loading !== null}
            onPress={() => handleLogin('google')}
            style={({ pressed }) => [styles.googleButton, pressed && styles.pressed]}
          >
            {loading === 'google' ? <ActivityIndicator color={Colors.gray600} /> : <>
              <Image source={require('../../assets/google-g.png')} style={styles.googleLogo} resizeMode="contain" />
              <Text style={styles.googleLabel}>Google로 계속하기</Text>
            </>}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apple로 계속하기"
            accessibilityState={{ disabled: loading !== null, busy: loading === 'apple' }}
            disabled={loading !== null}
            onPress={() => handleLogin('apple')}
            style={({ pressed }) => [styles.appleButton, pressed && styles.pressed]}
          >
            {loading === 'apple' ? <ActivityIndicator color={Colors.white} /> : <>
              <AntDesign name="apple1" size={20} color={Colors.white} />
              <Text style={styles.appleLabel}>Apple로 계속하기</Text>
            </>}
          </Pressable>
        </View>

        {isQaLoginEnabled() && <View style={styles.qaPanel}>
          <Text style={styles.qaTitle}>래틀 테스트 로그인</Text>
          <View style={styles.qaButtons}>
            {([['admin', '관리자'], ['regular', '직원'], ['part_time', '파트타이머']] as const).map(([role, label]) =>
              <Pressable key={role} accessibilityRole="button" accessibilityLabel={`${label} 테스트 로그인`}
                accessibilityState={{ disabled: loading !== null, busy: loading === role }} disabled={loading !== null}
                onPress={() => void handleQaLogin(role)} style={({ pressed }) => [styles.qaButton, pressed && styles.pressed]}>
                <Text style={styles.qaLabel}>{loading === role ? '로그인 중…' : label}</Text>
              </Pressable>)}
          </View>
        </View>}

        <Text style={styles.legal}>
          계속 진행 시{' '}
          <Text style={styles.legalEmphasis} onPress={() => router.push('/legal/terms')}>이용약관</Text> 및{' '}
          <Text style={styles.legalEmphasis} onPress={() => router.push('/legal/privacy')}>개인정보처리방침</Text>
          {'\n'}에 동의하게 됩니다
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  qaPanel: { width: '100%', marginTop: 24, padding: 16, borderRadius: 12, backgroundColor: Colors.gray50, gap: 12 },
  qaTitle: { fontSize: 13, color: Colors.gray600, fontWeight: '600' },
  qaButtons: { flexDirection: 'row', gap: 8 },
  qaButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: Colors.white },
  qaLabel: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 48,
  },
  logoArea: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoR: {
    fontSize: 48,
    fontWeight: '800',
    color: Colors.primary,
  },
  logoAttle: {
    fontSize: 48,
    fontWeight: '800',
    color: Colors.black,
    letterSpacing: -2,
  },
  logoDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginLeft: -2,
    marginBottom: 12,
  },
  headline: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.black,
    textAlign: 'center',
    lineHeight: 30,
  },
  subheadline: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.gray500,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 12,
  },
  buttonWrap: {
    width: '100%',
    marginTop: 48,
    gap: 12,
  },
  googleButton: {
    minHeight: 50, width: '100%', borderWidth: 1, borderColor: Colors.gray300,
    borderRadius: 8, backgroundColor: Colors.white, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 12,
  },
  googleLogo: { width: 20, height: 20 },
  googleLabel: { fontSize: Type.md, fontWeight: '500', color: Colors.gray700 },
  appleButton: {
    minHeight: 50, width: '100%', borderRadius: 8, backgroundColor: '#000',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  appleLabel: { fontSize: Type.md, fontWeight: '600', color: Colors.white },
  pressed: { opacity: 0.85 },
  legal: {
    fontSize: 12,
    fontWeight: '400',
    color: Colors.gray400,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 16,
  },
  legalEmphasis: {
    color: Colors.gray600,
    fontWeight: '600',
  },
});
