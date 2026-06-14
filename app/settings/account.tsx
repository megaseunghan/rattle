import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { updateUserProfile } from '../../lib/services/profile';

export default function AccountScreen() {
  const { user } = useAuth();
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; phone?: string };
  const [fullName, setFullName] = useState(meta.full_name ?? '');
  const [phone, setPhone] = useState(meta.phone ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const m = (user?.user_metadata ?? {}) as { full_name?: string; phone?: string };
    setFullName(m.full_name ?? '');
    setPhone(m.phone ?? '');
  }, [user?.id]);

  async function handleSave() {
    if (!fullName.trim()) {
      Alert.alert('입력 오류', '실명을 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await updateUserProfile({ name: fullName.trim(), phone: phone.trim() || null });
      Alert.alert('성공', '내 정보가 저장되었습니다.');
    } catch (e: unknown) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>내 정보</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.accountRow}>
          <Text style={styles.accountLabel}>로그인 계정</Text>
          <Text style={styles.accountValue} numberOfLines={1}>{user?.email}</Text>
        </View>

        <Text style={styles.label}>실명</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="실명 (출퇴근·급여에 사용)"
          placeholderTextColor={Colors.gray400}
        />
        <Text style={styles.label}>연락처</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          placeholder="010-0000-0000"
          placeholderTextColor={Colors.gray400}
          keyboardType="phone-pad"
        />
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.disabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Text style={styles.saveBtnText}>저장</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.white,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  scroll: { padding: 20 },
  accountRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: Colors.white, borderRadius: 12, borderWidth: 1, borderColor: Colors.gray100,
    paddingHorizontal: 16, paddingVertical: 14, marginBottom: 24,
  },
  accountLabel: { fontSize: 13, color: Colors.gray500, fontWeight: '500' },
  accountValue: { fontSize: 14, color: Colors.black, fontWeight: '600', flexShrink: 1, marginLeft: 12 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 8, marginTop: 6 },
  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: Colors.black,
  },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
  },
  saveBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
