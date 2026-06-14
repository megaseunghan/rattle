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
import { supabase } from '../../lib/supabase';
import { updateUserProfile, updateUserPassword } from '../../lib/services/profile';

const MIN_PASSWORD_LENGTH = 6;

export default function ProfileScreen() {
  const { user, store, currentRole, signOut, refreshStore } = useAuth();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(store?.name || '');

  // 개인 정보 (auth user_metadata)
  const meta = (user?.user_metadata ?? {}) as { full_name?: string; phone?: string };
  const [fullName, setFullName] = useState(meta.full_name ?? '');
  const [phone, setPhone] = useState(meta.phone ?? '');
  const [savingInfo, setSavingInfo] = useState(false);

  // 비밀번호 변경 (이메일 가입자만 — 소셜 로그인은 비밀번호 개념이 없음)
  const provider = (user?.app_metadata?.provider as string | undefined) ?? 'email';
  const isEmailUser = provider === 'email';
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    if (!store) return;
    setName(store.name || '');
  }, [store?.id]);

  useEffect(() => {
    const m = (user?.user_metadata ?? {}) as { full_name?: string; phone?: string };
    setFullName(m.full_name ?? '');
    setPhone(m.phone ?? '');
  }, [user?.id]);

  async function handleUpdateProfile() {
    if (!store || !name.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('stores')
        .update({ name: name.trim() })
        .eq('id', store.id);
      if (error) throw error;

      await refreshStore();
      Alert.alert('성공', '매장 정보가 수정되었습니다.');
    } catch (e: unknown) {
      Alert.alert('수정 실패', e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveInfo() {
    if (!fullName.trim()) {
      Alert.alert('입력 오류', '실명을 입력해주세요.');
      return;
    }
    setSavingInfo(true);
    try {
      await updateUserProfile({ name: fullName.trim(), phone: phone.trim() || null });
      Alert.alert('성공', '개인 정보가 저장되었습니다.');
    } catch (e: unknown) {
      Alert.alert('저장 실패', e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setSavingInfo(false);
    }
  }

  async function handleChangePassword() {
    if (newPw.length < MIN_PASSWORD_LENGTH) {
      Alert.alert('입력 오류', `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`);
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('입력 오류', '새 비밀번호가 일치하지 않습니다.');
      return;
    }
    setSavingPw(true);
    try {
      await updateUserPassword(newPw);
      setNewPw('');
      setConfirmPw('');
      Alert.alert('성공', '비밀번호가 변경되었습니다.');
    } catch (e: unknown) {
      Alert.alert('변경 실패', e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setSavingPw(false);
    }
  }

  async function handleDeleteAccount() {
    Alert.alert(
      '회원 탈퇴',
      '정말로 탈퇴하시겠습니까? 매장 정보와 모든 데이터가 즉시 삭제되며 복구할 수 없습니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const { error } = await supabase.functions.invoke('delete-account');
              if (error) throw error;
              await signOut();
              router.replace('/(auth)/login');
            } catch (e: unknown) {
              Alert.alert('탈퇴 실패', '탈퇴 처리에 실패했습니다. 고객센터에 문의해주세요.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }

  async function handleSignOut() {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>내 정보 설정</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 계정 (이메일) */}
        <View style={styles.accountRow}>
          <Text style={styles.accountLabel}>로그인 계정</Text>
          <Text style={styles.accountValue} numberOfLines={1}>{user?.email}</Text>
        </View>

        {/* 개인 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>개인 정보</Text>
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
            style={[styles.saveBtn, savingInfo && styles.disabled]}
            onPress={handleSaveInfo}
            disabled={savingInfo}
          >
            {savingInfo
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Text style={styles.saveBtnText}>개인 정보 저장</Text>}
          </TouchableOpacity>
        </View>

        {/* 비밀번호 변경 (이메일 가입자만) */}
        {isEmailUser && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>비밀번호 변경</Text>
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
            style={[styles.saveBtn, savingPw && styles.disabled]}
            onPress={handleChangePassword}
            disabled={savingPw}
          >
            {savingPw
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Text style={styles.saveBtnText}>비밀번호 변경</Text>}
          </TouchableOpacity>
        </View>
        )}

        {/* 매장 설정 (관리자 전용) */}
        {currentRole === 'admin' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>매장 정보</Text>
            <Text style={styles.label}>매장 이름</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="매장 이름"
              placeholderTextColor={Colors.gray400}
            />
            <TouchableOpacity
              style={[styles.saveBtn, loading && styles.disabled]}
              onPress={handleUpdateProfile}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator size="small" color={Colors.white} />
                : <Text style={styles.saveBtnText}>매장 정보 저장</Text>}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.menuCard}>
          {currentRole === 'admin' && (
            <>
              <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/sales')}>
                <Ionicons name="receipt-outline" size={20} color={Colors.gray600} />
                <Text style={styles.menuText}>매출 설정</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/settings/members')}>
                <Ionicons name="people-outline" size={20} color={Colors.gray600} />
                <Text style={styles.menuText}>멤버 관리</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
              </TouchableOpacity>
              <View style={styles.divider} />
            </>
          )}

          <TouchableOpacity style={styles.menuItem} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color={Colors.gray600} />
            <Text style={styles.menuText}>로그아웃</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.menuItem} onPress={handleDeleteAccount}>
            <Ionicons name="trash-outline" size={20} color={Colors.danger} />
            <Text style={[styles.menuText, { color: Colors.danger }]}>회원 탈퇴</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
          </TouchableOpacity>
        </View>

        <Text style={styles.version}>버전 1.0.0</Text>
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

  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.black, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.gray600, marginBottom: 8, marginTop: 6 },
  input: {
    backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, color: Colors.black,
  },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
    alignItems: 'center', marginTop: 14,
  },
  saveBtnText: { color: Colors.white, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },

  menuCard: {
    backgroundColor: Colors.white, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.gray100, overflow: 'hidden',
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuText: { flex: 1, fontSize: 15, fontWeight: '500', color: Colors.gray800 },
  divider: { height: 1, backgroundColor: Colors.gray50 },
  version: { textAlign: 'center', fontSize: 12, color: Colors.gray300, marginTop: 40 },
});
