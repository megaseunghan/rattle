import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/contexts/AuthContext';
import { Colors } from '../../constants/colors';

export default function SelectStoreScreen() {
  const [storeName, setStoreName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const { user, store, stores, switchStore } = useAuth();
  const router = useRouter();

  async function handleSelectStore(storeId: string) {
    await switchStore(storeId);
    router.replace('/(tabs)');
  }

  async function handleCreateStore() {
    if (!storeName.trim()) {
      Alert.alert('알림', '매장 이름을 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      if (!user) throw new Error('로그인이 필요합니다.');

      const { data, error } = await supabase
        .from('stores')
        .insert({ name: storeName.trim(), owner_id: user.id })
        .select('id')
        .single();

      if (error) throw error;

      await switchStore(data.id);
      router.replace('/(tabs)');
    } catch (error: unknown) {
      Alert.alert('오류', error instanceof Error ? error.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  const hasStores = stores.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{hasStores ? '매장 선택' : '매장 등록'}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {hasStores && stores.map((item) => {
          const isSelected = store?.id === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.storeCard, isSelected && styles.storeCardSelected]}
              onPress={() => handleSelectStore(item.id)}
              activeOpacity={0.7}
            >
              <View style={styles.storeCardContent}>
                <Text style={styles.storeName}>{item.name}</Text>
              </View>
              {isSelected && (
                <Ionicons name="checkmark-circle" size={24} color={Colors.primary} />
              )}
            </TouchableOpacity>
          );
        })}

        {hasStores && !showForm && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowForm(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color={Colors.primary} />
            <Text style={styles.addButtonText}>새 매장 추가</Text>
          </TouchableOpacity>
        )}

        {(!hasStores || showForm) && (
          <View style={styles.form}>
            {hasStores && <Text style={styles.formTitle}>새 매장 추가</Text>}
            {!hasStores && <Text style={styles.subtitle}>사용하실 매장 이름을 입력해주세요</Text>}
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
                {loading ? '등록 중...' : '등록하기'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.black,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.gray500,
    marginBottom: 16,
  },
  storeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
    backgroundColor: Colors.gray50,
  },
  storeCardSelected: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: Colors.white,
  },
  storeCardContent: {
    flex: 1,
  },
  storeName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.black,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
    gap: 6,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  form: {
    marginTop: 8,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.black,
    marginBottom: 16,
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
