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
import { updateStoreInfo } from '../../lib/services/stores';
import { AppBar, Button, Field } from '../../lib/components/ui';

export default function StoreInfoScreen() {
  const { store, refreshStore } = useAuth();
  const [name, setName] = useState(store?.name ?? '');
  const [address, setAddress] = useState(store?.address ?? '');
  const [saving, setSaving] = useState(false);

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

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="매장 정보" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
          <Button label={saving ? '저장 중...' : '저장하기'} variant="primary" onPress={handleSave} loading={saving} />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: Spacing.fieldGap },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray500 },

  settlementRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
  },
  settlementLeft: { gap: 4 },
  settlementValue: { fontSize: 14, fontWeight: '600', color: Colors.black },

  saveButtonWrap: { marginTop: 8 },
});
