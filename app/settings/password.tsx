import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  TextInput, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { updateUserPassword } from '../../lib/services/profile';

const MIN_PASSWORD_LENGTH = 6;

export default function PasswordScreen() {
  const { user } = useAuth();
  const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';
  const isEmailUser = provider === 'email';

  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleChange() {
    if (newPw.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('입력 오류', `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('입력 오류', '새 비밀번호가 일치하지 않습니다.');
      return;
    }
    setSaving(true);
    try {
      await updateUserPassword(newPw);
      setNewPw('');
      setConfirmPw('');
      Alert.alert('성공', '비밀번호가 변경되었습니다.');
      router.back();
    } catch (e: unknown) {
      Alert.alert('변경 실패', e instanceof Error ? e.message : '오류가 발생했습니다.');
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
        <Text style={styles.title}>비밀번호 변경</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {isEmailUser ? (
          <>
            <Text style={styles.label}>새 비밀번호</Text>
            <TextInput
              style={styles.input}
              value={newPw}
              onChangeText={setNewPw}
              placeholder={`${MIN_PASSWORD_LENGTH}자 이상`}
              placeholderTextColor={Colors.gray400}
              secureTextEntry
              autoCapitalize="none"
            />
            <Text style={styles.label}>새 비밀번호 확인</Text>
            <TextInput
              style={styles.input}
              value={confirmPw}
              onChangeText={setConfirmPw}
              placeholder="새 비밀번호 재입력"
              placeholderTextColor={Colors.gray400}
              secureTextEntry
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.disabled]}
              onPress={handleChange}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.saveBtnText}>비밀번호 변경</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <View style={styles.socialNotice}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.gray400} />
            <Text style={styles.socialNoticeText}>
              소셜 로그인 계정은 비밀번호가 없어 변경할 수 없어요.
            </Text>
          </View>
        )}
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
  socialNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.gray100, borderRadius: 12, padding: 16,
  },
  socialNoticeText: { flex: 1, fontSize: 13, color: Colors.gray600, lineHeight: 19 },
});
