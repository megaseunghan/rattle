import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { getErrorMessage } from '../../lib/utils/error';
import { deleteEmptyOwnedStore, updateStoreInfo } from '../../lib/services/stores';
import { AppBar, Button, Field } from '../../lib/components/ui';

export default function StoreInfoScreen() {
  const { store, user, currentRole, refreshStore } = useAuth();
  const [name, setName] = useState(store?.name ?? '');
  const [address, setAddress] = useState(store?.address ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!store) return;
    setName(store.name ?? '');
    setAddress(store.address ?? '');
  }, [store?.id]);

  async function handleSave() {
    if (!store) return;
    if (!name.trim()) { Alert.alert('입력 오류', '매장 이름을 입력해주세요.'); return; }

    setSaving(true);
    try {
      await updateStoreInfo(store.id, { name: name.trim(), address: address.trim() || null });
      await refreshStore();
      Alert.alert('저장 완료', '매장 정보가 저장되었습니다.');
    } catch (e: unknown) {
      Alert.alert('저장 실패', getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteStore() {
    if (!store || store.owner_id !== user?.id || deleting) return;
    const target = { id: store.id, name: store.name };
    Alert.alert(
      '빈 매장 삭제',
      `‘${target.name}’ 매장을 삭제할까요? 다른 멤버, 운영 기록 또는 POS 연결이 있으면 삭제되지 않아요. 삭제한 매장은 복구할 수 없어요.`,
      [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: async () => {
          setDeleting(true);
          try {
            await deleteEmptyOwnedStore(target.id);
          } catch (e: unknown) {
            Alert.alert('삭제 실패', getErrorMessage(e));
            setDeleting(false);
            return;
          }
          try {
            await refreshStore();
          } catch {
            // The delete succeeded. The store list screen can retry the refresh.
          }
          setDeleting(false);
          router.replace('/(auth)/select-store');
        } },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="매장 정보" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {store?.owner_id === user?.id && currentRole === 'admin' && <TouchableOpacity style={styles.settlementRow} onPress={() => router.push('/settings/financial-sharing')} accessibilityRole="button">
          <View style={styles.settlementLeft}><Text style={styles.fieldLabel}>손익 공유</Text><Text style={styles.settlementValue}>공유 대상 설정</Text></View><Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
        </TouchableOpacity>}
        <Field label="매장명" value={name} onChangeText={setName} placeholder="매장 이름" />

        <TouchableOpacity style={styles.settlementRow} onPress={() => router.push('/settings/sales')} activeOpacity={0.7}>
          <View style={styles.settlementLeft}>
            <Text style={styles.fieldLabel}>일 정산 시간</Text>
            <Text style={styles.settlementValue}>
              매일 {(store?.closing_time as string | undefined)?.slice(0, 5) ?? '23:00'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
        </TouchableOpacity>

        <Field label="매장 주소" value={address} onChangeText={setAddress} placeholder="도로명 주소 입력" />

        <View style={styles.saveButtonWrap}>
          <Button label={saving ? '저장 중...' : '저장하기'} variant="primary" onPress={handleSave} loading={saving} disabled={deleting} />
        </View>

        {store?.owner_id === user?.id && currentRole === 'admin' && (
          <View style={styles.deleteSection}>
            <Text style={styles.deleteHelp}>혼자 소유한 빈 매장은 삭제할 수 있어요. 운영 기록이나 POS 연결이 있으면 소유권을 이전해야 해요.</Text>
            <Button label="빈 매장 삭제" variant="danger" onPress={handleDeleteStore} loading={deleting} disabled={saving} />
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: Spacing.fieldGap },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },

  settlementRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 16,
  },
  settlementLeft: { flex: 1, gap: 4 },
  settlementValue: { fontSize: 14, fontWeight: '600', color: Colors.black },

  saveButtonWrap: { marginTop: 8 },
  deleteSection: { marginTop: 20, gap: 10 },
  deleteHelp: { fontSize: 13, lineHeight: 19, color: Colors.gray500 },
});
