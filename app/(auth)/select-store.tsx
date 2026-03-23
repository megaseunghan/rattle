import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/contexts/AuthContext';
import { Colors } from '../../constants/colors';

export default function SelectStoreScreen() {
  const [storeName, setStoreName] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, refreshStore } = useAuth();

  async function handleCreateStore() {
    if (!storeName.trim()) {
      Alert.alert('알림', '매장 이름을 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      if (!user) throw new Error('로그인이 필요합니다.');

      const { error } = await supabase
        .from('stores')
        .insert({ name: storeName.trim(), owner_id: user.id });

      if (error) throw error;

      // AuthContext 갱신 → 라우팅 가드가 자동으로 탭으로 이동
      await refreshStore();
    } catch (error: any) {
      Alert.alert('오류', error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>매장 등록</Text>
        <Text style={styles.subtitle}>
          사용하실 매장 이름을 입력해주세요
        </Text>

        <TextInput
          style={styles.input}
          placeholder="예: 카페 라틀"
          placeholderTextColor={Colors.gray400}
          value={storeName}
          onChangeText={setStoreName}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleCreateStore}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? '등록 중...' : '매장 등록하기'}
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
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.black,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.gray500,
    marginBottom: 32,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: Colors.black,
    backgroundColor: Colors.gray50,
    marginBottom: 16,
  },
  button: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
