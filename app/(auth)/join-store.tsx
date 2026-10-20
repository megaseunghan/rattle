import { useState } from 'react';
import {
  View, Text, StyleSheet, Alert, SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { requestStoreMembership } from '../../lib/services/storeMembers';
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
    if (!/^01[016789][0-9]{7,8}$/.test(phone.replace(/[^0-9]/g, ''))) {
      Alert.alert('입력 확인', '직원 정보에 등록한 휴대폰 번호를 입력해주세요.');
      return;
    }
    if (!user || loading) return;

    setLoading(true);
    try {
      const result = await requestStoreMembership(cleaned, trimmedName, phone);

      Alert.alert(
        '참여 신청 완료',
        `"${result.store_name}" 매장에 참여 신청했습니다.\n관리자가 신청을 확인하면 직원 정보에 연결되고 접속할 수 있어요.`,
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
        <Text style={styles.subtitle}>사업자번호로 매장을 찾고, 이름·연락처로 직원 정보를 연결해요. 관리자 확인 후 참여할 수 있어요.</Text>

        <View style={styles.fieldGroup}>
          <Field
            label="이름"
            placeholder="직원 정보에 등록된 이름"
            maxLength={100}
            value={name}
            onChangeText={setName}
          />
          <Field
            label="휴대폰 번호"
            helpText="관리자가 등록한 직원 정보와 같은 번호를 입력해주세요"
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
