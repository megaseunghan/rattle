import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { completeAuthCallback } from '../../lib/services/authCallback';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { Button } from '../../lib/components/ui';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  async function handleKakaoLogin() {
    setLoading(true);
    try {
      const redirectUrl = Linking.createURL('/');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (data.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (result.type === 'success') {
          if (!await completeAuthCallback(result.url, redirectUrl)) {
            throw new Error('인증 응답에 로그인 정보가 없습니다.');
          }
        }
      }
      // AuthContext의 onAuthStateChange가 이후 라우팅을 처리함
    } catch {
      Alert.alert('오류', '카카오 로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        {/* 로고 영역 */}
        <View style={styles.logoArea}>
          <Text style={styles.logoR}>R</Text>
          <Text style={styles.logoAttle}>attle</Text>
          <View style={styles.logoDot} />
        </View>

        <Text style={styles.headline}>간편하게 시작하는{'\n'}매장 손익관리</Text>
        <Text style={styles.subheadline}>카카오 계정 하나로{'\n'}로그인하고 회원가입까지 한 번에</Text>

        <View style={styles.buttonWrap}>
          <Button
            label={loading ? '처리 중...' : '카카오로 시작하기'}
            variant="kakao"
            onPress={handleKakaoLogin}
            loading={loading}
          />
        </View>

        <Text style={styles.legal}>
          계속 진행 시{' '}
          <Text style={styles.legalEmphasis} onPress={() => router.push('/legal/terms')}>이용약관</Text> 및{' '}
          <Text style={styles.legalEmphasis} onPress={() => router.push('/legal/privacy')}>개인정보처리방침</Text>
          {'\n'}에 동의하게 됩니다
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
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
  },
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
