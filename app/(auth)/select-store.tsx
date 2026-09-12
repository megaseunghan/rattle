import { useState, useCallback } from 'react';
import {
  View,
  Text,
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
import { Spacing } from '../../constants/designTokens';
import { getErrorMessage } from '../../lib/utils/error';
import { Button, Field, ListCard } from '../../lib/components/ui';

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
      Alert.alert('오류', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  const hasStores = stores.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{hasStores ? '매장 관리' : '환영합니다'}</Text>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} hitSlop={8}>
            <Ionicons name="log-out-outline" size={20} color={Colors.gray500} />
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSub}>
          {hasStores ? '전환하거나 새 매장을 추가하세요' : '어떻게 시작할지 선택해주세요'}
        </Text>
      </View>

      {isRefreshing ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={Colors.primary} />
      ) : (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 기존 매장 목록 */}
        {hasStores && (
          <View style={styles.storeList}>
            {stores.map((item) => {
              const isSelected = store?.id === item.id;
              return (
                <ListCard
                  key={item.id}
                  selected={isSelected}
                  onPress={() => handleSelectStore(item.id)}
                >
                  <View style={styles.storeCardRow}>
                    <Text style={styles.storeName}>{item.name}</Text>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
                    )}
                  </View>
                </ListCard>
              );
            })}
          </View>
        )}

        {/* 신규 회원: stores 로드 완료 후 진짜 매장 없을 때만 표시 */}
        {storesLoaded && !hasStores && !showForm && (
          <View style={styles.optionGroup}>
            <ListCard trailingIcon="chevron" onPress={() => setShowForm(true)} style={styles.optionCardPrimary}>
              <View style={styles.optionRow}>
                <View style={[styles.optionIcon, styles.optionIconPrimary]}>
                  <Ionicons name="storefront" size={22} color={Colors.primary} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>매장 등록</Text>
                  <Text style={styles.optionDesc}>사장님이라면 직접 매장을 만들어 시작하세요</Text>
                </View>
              </View>
            </ListCard>

            <ListCard trailingIcon="chevron" onPress={() => router.push('/(auth)/join-store')}>
              <View style={styles.optionRow}>
                <View style={styles.optionIcon}>
                  <Ionicons name="people" size={22} color={Colors.gray600} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>기존 매장 참여</Text>
                  <Text style={styles.optionDesc}>직원이라면 사업자번호로 참여를 신청하세요</Text>
                </View>
              </View>
            </ListCard>
          </View>
        )}

        {/* 기존 회원: 매장 있을 때 추가/참여 버튼 */}
        {hasStores && !showForm && (
          <View style={styles.optionGroup}>
            <ListCard trailingIcon="chevron" onPress={() => setShowForm(true)}>
              <View style={styles.optionRow}>
                <View style={[styles.optionIcon, styles.optionIconPrimary]}>
                  <Ionicons name="add" size={22} color={Colors.primary} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>새 매장 추가</Text>
                  <Text style={styles.optionDesc}>새로운 매장을 등록합니다</Text>
                </View>
              </View>
            </ListCard>

            <ListCard trailingIcon="chevron" onPress={() => router.push('/(auth)/join-store')}>
              <View style={styles.optionRow}>
                <View style={styles.optionIcon}>
                  <Ionicons name="people" size={22} color={Colors.gray600} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>기존 매장 참여</Text>
                  <Text style={styles.optionDesc}>사업자번호로 참여를 신청합니다</Text>
                </View>
              </View>
            </ListCard>
          </View>
        )}

        {/* 매장 등록 폼 */}
        {storesLoaded && showForm && (
          <View style={styles.form}>
            <Text style={styles.formTitle}>{hasStores ? '새 매장 추가' : '매장 등록'}</Text>
            <View style={styles.formField}>
              <Field
                label="매장 이름"
                placeholder="예: 카페 라틀"
                value={storeName}
                onChangeText={setStoreName}
              />
            </View>
            <Button
              label={loading ? '등록 중...' : '등록하기'}
              variant="primary"
              onPress={handleCreateStore}
              loading={loading}
            />
            <View style={styles.cancelButtonWrap}>
              <Button label="취소" variant="text" onPress={() => setShowForm(false)} />
            </View>
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
    paddingHorizontal: Spacing.screenX,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
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
    fontSize: 13,
    color: Colors.gray500,
    fontWeight: '500',
  },
  headerSub: {
    fontSize: 13,
    color: Colors.gray500,
    marginTop: 6,
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenX,
    paddingTop: 16,
    paddingBottom: 32,
  },
  storeList: {
    gap: Spacing.listGap,
  },
  storeCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  storeName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.black,
  },
  optionGroup: {
    gap: Spacing.listGap,
    marginTop: 4,
  },
  optionCardPrimary: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: Colors.tinted,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
    fontSize: 14,
    fontWeight: '700',
    color: Colors.black,
  },
  optionDesc: {
    fontSize: 12,
    color: Colors.gray500,
    lineHeight: 17,
  },
  form: {
    marginTop: 8,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.black,
    marginBottom: 16,
  },
  formField: {
    marginBottom: Spacing.fieldGap,
  },
  cancelButtonWrap: {
    marginTop: 4,
    alignItems: 'center',
  },
});
