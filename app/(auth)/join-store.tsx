import { useState } from 'react';
import {
  View, Text, StyleSheet, Alert, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/contexts/AuthContext';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { getErrorMessage } from '../../lib/utils/error';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { AppBar, Button, Field } from '../../lib/components/ui';

export default function JoinStoreScreen() {
  const [businessNumber, setBusinessNumber] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const isDirty = name.trim().length > 0 || businessNumber.trim().length > 0 || phone.trim().length > 0;
  const bypassLeaveGuard = useConfirmLeave(isDirty, { message: '지금 나가면 입력한 참여 신청 내용이 저장되지 않아요.' });

  async function handleJoin() {
    const cleaned = businessNumber.replace(/[^0-9]/g, '');
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('알림', '이름을 입력해주세요.');
      return;
    }
    if (cleaned.length !== 10) {
      Alert.alert('알림', '사업자번호 10자리를 입력해주세요.\n예: 1234567890');
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const { data: rows, error: storeError } = await supabase
        .rpc('find_store_by_business_number', { p_number: cleaned });
      const storeData = rows?.[0] ?? null;

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
          applicant_name: trimmedName,
          phone: phone.trim() || null,
          role: 'member',
          status: 'pending',
        });

      if (insertError) throw insertError;

      Alert.alert(
        '참여 신청 완료',
        `"${storeData.name}" 매장에 참여 신청했습니다.\n관리자가 승인하면 접속할 수 있습니다.`,
        [{ text: '확인', onPress: () => { bypassLeaveGuard(); router.back(); } }],
      );
    } catch (e: unknown) {
      Alert.alert('오류', getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="기존 매장 참여" onBack={() => router.back()} />

      <View style={styles.content}>
        <Text style={styles.subtitle}>참여할 매장 정보와 본인 정보를 입력하세요</Text>

        <View style={styles.fieldGroup}>
          <Field
            label="이름"
            placeholder="출퇴근·급여에 사용돼요"
            value={name}
            onChangeText={setName}
          />
          <Field
            label="연락처 (선택)"
            placeholder="010-0000-0000"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Field
            label="사업자번호"
            placeholder="1234567890"
            helpText="매장 사업자등록번호 10자리를 입력해주세요"
            value={businessNumber}
            onChangeText={setBusinessNumber}
            keyboardType="number-pad"
            maxLength={10}
          />
        </View>

        <View style={styles.buttonWrap}>
          <Button
            label={loading ? '신청 중...' : '참여 신청'}
            variant="primary"
            onPress={handleJoin}
            loading={loading}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  content: { padding: Spacing.screenX },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.gray500,
    lineHeight: 19,
    marginTop: 4,
    marginBottom: 20,
  },
  fieldGroup: {
    gap: Spacing.fieldGap,
    marginBottom: 24,
  },
  buttonWrap: {
    marginTop: 4,
  },
});
