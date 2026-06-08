import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/contexts/AuthContext';
import { Colors } from '../../constants/colors';

export default function SelectStoreScreen() {
  const [storeName, setStoreName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const { user, store, stores, storesLoaded, switchStore, refreshStore, signOut } = useAuth();
  const router = useRouter();

  function handleLogout() {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  useFocusEffect(useCallback(() => {
    setIsRefreshing(true);
    refreshStore().finally(() => setIsRefreshing(false));
  }, []));

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
        <View style={styles.headerRow}>
          <Text style={styles.title}>{hasStores ? '매장 선택' : '환영합니다'}</Text>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} hitSlop={8}>
            <Ionicons name="log-out-outline" size={20} color={Colors.gray500} />
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSub}>
          {hasStores ? '관리할 매장을 선택하세요' : '어떻게 시작할지 선택해주세요'}
        </Text>
      </View>

      {isRefreshing ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={Colors.primary} />
      ) : (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 기존 매장 목록 */}
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

        {/* 신규 회원: stores 로드 완료 후 진짜 매장 없을 때만 표시 */}
        {storesLoaded && !hasStores && !showForm && (
          <View style={styles.optionGroup}>
            <TouchableOpacity
              style={[styles.optionCard, styles.optionCardPrimary]}
              onPress={() => setShowForm(true)}
              activeOpacity={0.8}
            >
              <View style={[styles.optionIcon, styles.optionIconPrimary]}>
                <Ionicons name="storefront" size={24} color={Colors.primary} />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>매장 등록</Text>
                <Text style={styles.optionDesc}>사장님이라면 직접 매장을 만들어 시작하세요</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => router.push('/(auth)/join-store')}
              activeOpacity={0.8}
            >
              <View style={styles.optionIcon}>
                <Ionicons name="people" size={24} color={Colors.gray600} />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>기존 매장 참여</Text>
                <Text style={styles.optionDesc}>직원이라면 사업자번호로 참여를 신청하세요</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
            </TouchableOpacity>
          </View>
        )}

        {/* 기존 회원: 매장 있을 때 추가/참여 버튼 */}
        {hasStores && !showForm && (
          <View style={styles.optionGroup}>
            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => setShowForm(true)}
              activeOpacity={0.8}
            >
              <View style={[styles.optionIcon, styles.optionIconPrimary]}>
                <Ionicons name="add" size={24} color={Colors.primary} />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>새 매장 추가</Text>
                <Text style={styles.optionDesc}>새로운 매장을 등록합니다</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionCard}
              onPress={() => router.push('/(auth)/join-store')}
              activeOpacity={0.8}
            >
              <View style={styles.optionIcon}>
                <Ionicons name="people" size={24} color={Colors.gray600} />
              </View>
              <View style={styles.optionTextWrap}>
                <Text style={styles.optionTitle}>기존 매장 참여</Text>
                <Text style={styles.optionDesc}>사업자번호로 참여를 신청합니다</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
            </TouchableOpacity>
          </View>
        )}

        {/* 매장 등록 폼 */}
        {storesLoaded && showForm && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>{hasStores ? '새 매장 추가' : '매장 등록'}</Text>
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
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowForm(false)}
            >
              <Text style={styles.cancelButtonText}>취소</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
      )}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.black,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  logoutText: {
    fontSize: 14,
    color: Colors.gray500,
    fontWeight: '500',
  },
  headerSub: {
    fontSize: 15,
    color: Colors.gray500,
    marginTop: 6,
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
  optionGroup: {
    gap: 12,
    marginTop: 4,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 16,
    padding: 16,
  },
  optionCardPrimary: {
    borderColor: Colors.primary,
    backgroundColor: Colors.tinted,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray100,
  },
  optionIconPrimary: {
    backgroundColor: Colors.white,
  },
  optionTextWrap: {
    flex: 1,
    gap: 3,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.black,
  },
  optionDesc: {
    fontSize: 13,
    color: Colors.gray500,
    lineHeight: 18,
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
  cancelButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 15,
    color: Colors.gray500,
  },
});
