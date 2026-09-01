import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';

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
          const fragment = result.url.split('#')[1] ?? '';
          const params = new URLSearchParams(fragment);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (sessionError) throw sessionError;
          } else {
            // PKCE flow fallback
            const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
            if (sessionError) throw sessionError;
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
        <Text style={styles.tagline}>발주 · 재고 · 레시피</Text>

        <TouchableOpacity
          style={[styles.kakaoButton, loading && styles.buttonDisabled]}
          onPress={handleKakaoLogin}
          disabled={loading}
        >
          <Text style={styles.kakaoButtonText}>
            {loading ? '처리 중...' : '카카오로 시작하기'}
          </Text>
        </TouchableOpacity>
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
    paddingHorizontal: 32,
  },
  logoArea: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 8,
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
  tagline: {
    fontSize: 14,
    color: Colors.gray500,
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 48,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  kakaoButton: {
    height: 52,
    backgroundColor: '#FEE500',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kakaoButtonText: {
    color: '#191919',
    fontSize: 16,
    fontWeight: '700',
  },
});
