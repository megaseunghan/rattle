import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { submitCorrection } from '../../lib/services/attendanceCorrections';
import { CorrectionTarget } from '../../types';
import { AppBar, Badge, Button } from '../../lib/components/ui';

const TARGETS: { key: CorrectionTarget; label: string }[] = [
  { key: 'clock_in', label: '출근시간' },
  { key: 'clock_out', label: '퇴근시간' },
  { key: 'both', label: '둘 다' },
];

function fmtTime(iso?: string | null): string {
  if (!iso) return '기록 없음';
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export default function CorrectionRequestScreen() {
  const { store } = useAuth();
  const params = useLocalSearchParams<{
    employeeId: string; date: string; clockIn?: string; clockOut?: string;
  }>();
  const { employeeId, date, clockIn, clockOut } = params;

  const [target, setTarget] = useState<CorrectionTarget>('clock_in');
  const [requestedIn, setRequestedIn] = useState<Date | null>(clockIn ? new Date(clockIn) : new Date(`${date}T09:00:00`));
  const [requestedOut, setRequestedOut] = useState<Date | null>(clockOut ? new Date(clockOut) : new Date(`${date}T18:00:00`));
  const [reason, setReason] = useState('');
  const [pickerOpen, setPickerOpen] = useState<'in' | 'out' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!store || !employeeId || !date) return;
    if (!reason.trim()) {
      Alert.alert('입력 오류', '정정 사유를 입력해주세요.');
      return;
    }
    setSubmitting(true);
    try {
      await submitCorrection({
        storeId: store.id,
        employeeId,
        attendanceDate: date,
        target,
        originalClockIn: clockIn ?? null,
        originalClockOut: clockOut ?? null,
        requestedClockIn: target !== 'clock_out' ? (requestedIn?.toISOString() ?? null) : null,
        requestedClockOut: target !== 'clock_in' ? (requestedOut?.toISOString() ?? null) : null,
        reason: reason.trim(),
        photoUrl: null,
      });
      Alert.alert('요청 완료', '사장님에게 알림이 발송됐어요. 승인되면 근태 기록에 반영돼요.', [
        { text: '확인', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('요청 실패', e.message ?? '잠시 후 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!employeeId || !date) return null;

  return (
    <SafeAreaView style={styles.container}>
      <AppBar title="근태 정정 요청" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.recordCard}>
          <View style={styles.recordHeader}>
            <Text style={styles.recordDate}>{date}</Text>
            <Badge label="정정 대상" variant="neutral" />
          </View>
          <Text style={styles.recordTime}>기록된 출근 {fmtTime(clockIn)}</Text>
          <Text style={styles.recordTime}>기록된 퇴근 {fmtTime(clockOut)}</Text>
        </View>

        <Text style={styles.label}>정정 항목</Text>
        <View style={styles.chipRow}>
          {TARGETS.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.chip, target === t.key && styles.chipActive]}
              onPress={() => setTarget(t.key)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, target === t.key && styles.chipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>정정 요청 시간</Text>
        <View style={styles.timeGroup}>
          {target !== 'clock_out' && (
            <TouchableOpacity style={styles.timeBtn} onPress={() => setPickerOpen('in')} activeOpacity={0.7}>
              <Text style={styles.timeBtnLabel}>출근</Text>
              <Text style={styles.timeBtnValue}>{fmtTime(requestedIn?.toISOString())}</Text>
            </TouchableOpacity>
          )}
          {target !== 'clock_in' && (
            <TouchableOpacity style={styles.timeBtn} onPress={() => setPickerOpen('out')} activeOpacity={0.7}>
              <Text style={styles.timeBtnLabel}>퇴근</Text>
              <Text style={styles.timeBtnValue}>{fmtTime(requestedOut?.toISOString())}</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.label}>정정 사유</Text>
        <TextInput
          style={styles.reasonInput}
          value={reason}
          onChangeText={setReason}
          placeholder="예: GPS 오류로 실제 출근 시간과 다르게 기록됐어요"
          placeholderTextColor={Colors.gray400}
          multiline
          textAlignVertical="top"
        />

        <Button label={submitting ? '요청 중...' : '정정 요청하기'} variant="primary" onPress={handleSubmit} loading={submitting} />
      </ScrollView>

      {pickerOpen && (
        <DateTimePicker
          value={(pickerOpen === 'in' ? requestedIn : requestedOut) ?? new Date()}
          mode="time"
          locale="ko-KR"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, value) => {
            if (Platform.OS === 'android') setPickerOpen(null);
            if (!value) return;
            if (pickerOpen === 'in') setRequestedIn(value); else setRequestedOut(value);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray50 },
  scroll: { padding: Spacing.screenX, paddingBottom: 40, gap: 14 },

  recordCard: {
    borderWidth: 1, borderColor: Colors.gray100, borderRadius: 14,
    padding: 14, gap: 6, backgroundColor: Colors.white,
  },
  recordHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recordDate: { fontSize: 13, fontWeight: '600', color: Colors.gray500 },
  recordTime: { fontSize: 15, fontWeight: '700', color: Colors.black },

  label: { fontSize: 13, fontWeight: '700', color: Colors.gray600 },

  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: Colors.gray200 },
  chipActive: { backgroundColor: Colors.black, borderColor: Colors.black },
  chipText: { fontSize: 13, fontWeight: '500', color: Colors.gray600 },
  chipTextActive: { color: Colors.white, fontWeight: '600' },

  timeGroup: { flexDirection: 'row', gap: 10 },
  timeBtn: {
    flex: 1, borderWidth: 1, borderColor: Colors.primary, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, gap: 3,
  },
  timeBtnLabel: { fontSize: 11, fontWeight: '600', color: Colors.gray400 },
  timeBtnValue: { fontSize: 15, fontWeight: '700', color: Colors.black },

  reasonInput: {
    minHeight: 74, borderWidth: 1, borderColor: Colors.gray200, borderRadius: 12,
    padding: 12, fontSize: 14, color: Colors.black,
  },
});
