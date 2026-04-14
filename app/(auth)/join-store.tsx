import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/contexts/AuthContext';
import { Colors } from '../../constants/colors';

export default function JoinStoreScreen() {
  const [businessNumber, setBusinessNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  async function handleJoin() {
    const cleaned = businessNumber.replace(/[^0-9]/g, '');
    if (cleaned.length !== 10) {
      Alert.alert('알림', '사업자번호 10자리를 입력해주세요.\n예: 1234567890');
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('id, name')
        .eq('business_number', cleaned)
        .single();

      if (storeError || !storeData) {
        Alert.alert('매장을 찾을 수 없습니다', '사업자번호를 다시 확인해주세요.');
        return;
      }

      const { data: existing } = await supabase
        .from('store_members')
        .select('id, status')
        .eq('store_id', storeData.id)
        .eq('user_id', user.id)
        .single();

      if (existing) {
        const messages: Record<string, string> = {
          pending: '관리자의 승인을 기다리고 있습니다.',
          approved: '이미 해당 매장의 멤버입니다.',
          rejected: '참여가 거절된 상태입니다. 관리자에게 문의해주세요.',
        };
        Alert.alert('알림', messages[existing.status] ?? '이미 신청한 매장입니다.');
        return;
      }

      const { error: insertError } = await supabase
        .from('store_members')
        .insert({
          store_id: storeData.id,
          user_id: user.id,
          user_email: user.email ?? null,
          role: 'member',
          status: 'pending',
        });

      if (insertError) throw insertError;

      Alert.alert(
        '참여 신청 완료',
        `"${storeData.name}" 매장에 참여 신청했습니다.\n관리자가 승인하면 접속할 수 있습니다.`,
        [{ text: '확인', onPress: () => router.back() }],
      );
    } catch (e: unknown) {
      Alert.alert('오류', e instanceof Error ? e.message : '오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.black} />
        </TouchableOpacity>
        <Text style={styles.title}>기존 매장 참여</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.subtitle}>참여할 매장의 사업자번호를 입력하세요</Text>
        <TextInput
          style={styles.input}
          placeholder="사업자번호 10자리 (예: 1234567890)"
          placeholderTextColor={Colors.gray400}
          value={businessNumber}
          onChangeText={setBusinessNumber}
          keyboardType="number-pad"
          maxLength={10}
        />
        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleJoin}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? '신청 중...' : '참여 신청'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  content: { padding: 24 },
  subtitle: { fontSize: 15, color: Colors.gray500, marginBottom: 20, lineHeight: 22 },
  input: {
    height: 52, borderWidth: 1, borderColor: Colors.gray200,
    borderRadius: 12, paddingHorizontal: 16, fontSize: 16,
    color: Colors.black, backgroundColor: Colors.gray50, marginBottom: 16,
  },
  button: {
    height: 52, backgroundColor: Colors.primary,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
});
