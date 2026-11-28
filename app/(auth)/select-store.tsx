import { useScopedWriteGuard } from '../../lib/hooks/useScopedWriteGuard';
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { AppIcon } from '../../lib/icons/AppIcon';
import { StoreSetupWizard } from '../../lib/components/StoreSetupWizard';
import { useAuth } from '../../lib/contexts/AuthContext';
import { Colors } from '../../constants/colors';
import { ListCardStyle, Spacing } from '../../constants/designTokens';
import { getErrorMessage } from '../../lib/utils/error';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { Skeleton, SkeletonGroup } from '../../lib/components/skeleton';
import { Button, ListCard } from '../../lib/components/ui';
import { listMyDeletedStores, restoreDeletedStore, type DeletedStore } from '../../lib/services/stores';
import { formatRestoreDeadline } from '../../lib/utils/storeDeletion';
import { deleteAccount } from '../../lib/services/account';
import { isAuthCancelled } from '../../lib/services/socialAuth';

export default function SelectStoreScreen() {
  const [showForm, setShowForm] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletedStores, setDeletedStores] = useState<DeletedStore[]>([]);
  const [deletedError, setDeletedError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const { user, store, stores, storesLoaded, switchStore, refreshStore, signOut } = useAuth();
  const router = useRouter();
  const canWrite = useScopedWriteGuard([]);

  function handleLogout() {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '로그아웃', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  function handleDeleteAccount() {
    if (!canWrite()) return;
    Alert.alert('회원 탈퇴', '계정을 삭제할까요? 매장의 급여·매입 기록은 보존돼요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '탈퇴하기',
        style: 'destructive',
        onPress: async () => {
          try {
            if (!canWrite()) return;
            await deleteAccount();
            await signOut();
          } catch (error) {
            if (isAuthCancelled(error)) return;
            Alert.alert('탈퇴 확인', getErrorMessage(error));
          }
        },
      },
    ]);
  }

  const reload = useCallback(async () => {
    setIsRefreshing(true);
    setLoadError(null);
    setDeletedError(null);
    const [storesResult, deletedResult] = await Promise.allSettled([refreshStore(), listMyDeletedStores()]);
    if (storesResult.status === 'rejected') setLoadError(getErrorMessage(storesResult.reason, '매장 목록을 불러오지 못했어요.'));
    if (deletedResult.status === 'fulfilled') setDeletedStores(deletedResult.value);
    else { setDeletedStores([]); setDeletedError('삭제한 매장 목록을 불러오지 못했어요.'); }
    setIsRefreshing(false);
  }, [refreshStore]);
  useFocusEffect(useCallback(() => { void reload(); }, [reload]));

  async function handleSelectStore(storeId: string) {
    try {
      await switchStore(storeId);
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('매장 전환', getErrorMessage(e, '매장을 바꾸지 못했어요. 다시 시도해주세요.'));
    }
  }

  function handleRestore(target: DeletedStore) {
    if (!canWrite() || restoringId) return;
    Alert.alert('매장 복구', `‘${target.name}’ 매장을 복구할까요? 구성원들도 다시 매장을 볼 수 있게 돼요.`, [
      { text: '취소', style: 'cancel' },
      { text: '복구', onPress: () => { void restore(target); } },
    ]);
  }

  async function restore(target: DeletedStore) {
    setRestoringId(target.id);
    try {
      if (!canWrite()) return;
      await restoreDeletedStore(target.id);
      await reload();
      Alert.alert('복구 완료', `‘${target.name}’ 매장을 복구했어요.`);
    } catch (e) {
      Alert.alert('복구 실패', getErrorMessage(e, '매장을 복구하지 못했어요. 다시 시도해주세요.'));
    } finally {
      setRestoringId(null);
    }
  }

  const hasStores = stores.length > 0;

  if (showForm && user && canWrite()) return <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
    <StoreSetupWizard knownRequestIds={stores.flatMap(s => s.setup_request_id ? [s.setup_request_id] : [])} userId={user.id} onCancel={() => setShowForm(false)} onCreated={async (id, choice) => {
      await refreshStore(id);
      router.replace(choice === 'now' ? '/settings/pos-sync?setup=1' : '/(tabs)');
    }} />
  </SafeAreaView>;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>{hasStores ? '매장 관리' : '환영합니다'}</Text>
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} accessibilityRole="button" accessibilityLabel="로그아웃" activeOpacity={0.7}>
            <AppIcon name="log-out-outline" size={20} color={Colors.gray500} />
            <Text style={styles.logoutText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.headerSub}>
          {hasStores ? '전환하거나 새 매장을 추가하세요' : '어떻게 시작할지 선택해주세요'}
        </Text>
      </View>

      {isRefreshing ? (
        <SkeletonGroup label="매장 목록 불러오는 중" style={[styles.scrollContent, styles.storeList]}>
          {[0, 1, 2].map(i => <View key={i} style={[ListCardStyle, styles.storeCardRow]}><Skeleton width={i % 2 ? '42%' : '56%'} height={16} /></View>)}
        </SkeletonGroup>
      ) : (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {loadError && <ErrorMessage message={loadError} onRetry={() => { void reload(); }} />}
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
                      <AppIcon name="checkmark-circle" size={22} color={Colors.primary} />
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
            <ListCard trailingIcon="chevron" onPress={() => { if (canWrite()) setShowForm(true); }} style={styles.optionCardPrimary}>
              <View style={styles.optionRow}>
                <View style={[styles.optionIcon, styles.optionIconPrimary]}>
                  <AppIcon name="storefront" size={22} color={Colors.primary} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>매장 등록</Text>
                  <Text style={styles.optionDesc}>사장님이라면 직접 매장을 만들어 시작하세요</Text>
                </View>
              </View>
            </ListCard>

            <ListCard trailingIcon="chevron" onPress={() => { if (canWrite()) router.push('/(auth)/join-store'); }}>
              <View style={styles.optionRow}>
                <View style={styles.optionIcon}>
                  <AppIcon name="people" size={22} color={Colors.gray600} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>기존 매장 참여</Text>
                  <Text style={styles.optionDesc}>관리자에게 받은 참여코드로 신청하세요</Text>
                </View>
              </View>
            </ListCard>
          </View>
        )}

        {/* 기존 회원: 매장 있을 때 추가/참여 버튼 */}
        {hasStores && !showForm && (
          <View style={styles.optionGroup}>
            <ListCard trailingIcon="chevron" onPress={() => { if (canWrite()) setShowForm(true); }}>
              <View style={styles.optionRow}>
                <View style={[styles.optionIcon, styles.optionIconPrimary]}>
                  <AppIcon name="add" size={22} color={Colors.primary} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>새 매장 추가</Text>
                  <Text style={styles.optionDesc}>새로운 매장을 등록합니다</Text>
                </View>
              </View>
            </ListCard>

            <ListCard trailingIcon="chevron" onPress={() => { if (canWrite()) router.push('/(auth)/join-store'); }}>
              <View style={styles.optionRow}>
                <View style={styles.optionIcon}>
                  <AppIcon name="people" size={22} color={Colors.gray600} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={styles.optionTitle}>기존 매장 참여</Text>
                  <Text style={styles.optionDesc}>참여코드로 참여를 신청합니다</Text>
                </View>
              </View>
            </ListCard>
          </View>
        )}

        {(deletedStores.length > 0 || deletedError) && (
          <View style={styles.deletedSection}>
            <Text style={styles.deletedTitle}>삭제한 매장</Text>
            {deletedError && <Text style={styles.deletedHelp}>{deletedError}</Text>}
            {deletedStores.map(item => (
              <ListCard key={item.id}>
                <View style={styles.storeCardRow}>
                  <View style={styles.optionTextWrap}>
                    <Text style={styles.storeName}>{item.name}</Text>
                    <Text style={styles.deletedHelp}>{formatRestoreDeadline(item.purgeAfter)}까지 복구할 수 있어요</Text>
                  </View>
                  <View style={styles.restoreAction}>
                    <Button label="복구" variant="secondary" onPress={() => handleRestore(item)} loading={restoringId === item.id} disabled={!!restoringId || !canWrite()} />
                  </View>
                </View>
              </ListCard>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleDeleteAccount} accessibilityRole="button" activeOpacity={0.7}>
          <Text style={styles.deleteAccountText}>회원 탈퇴</Text>
        </TouchableOpacity>
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.homeCanvas,
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
    minHeight: 44,
    minWidth: 44,
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
  deleteAccountBtn: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginTop: 8,
  },
  deleteAccountText: {
    fontSize: 13,
    color: Colors.gray400,
    fontWeight: '500',
    textDecorationLine: 'underline',
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
    gap: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  storeName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.black,
  },
  deletedSection: {
    gap: Spacing.listGap,
    marginTop: 28,
  },
  deletedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.gray600,
  },
  restoreAction: {
    width: 88,
    flexShrink: 0,
  },
  deletedHelp: {
    fontSize: 12,
    color: Colors.gray500,
    lineHeight: 17,
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
