import { getErrorMessage } from '../../lib/utils/error';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { usePayrollSubmissions } from '../../lib/hooks/usePayrollSubmissions';
import { submitWorkMinutes } from '../../lib/services/payrollSubmissions';
import { formatWorkedMinutes } from '../../lib/utils/workMinutes';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { AppBar, Button, Field } from '../../lib/components/ui';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';

const STATUS = { pending: '관리자 확인 대기', approved: '관리자 확인 완료', rejected: '수정 후 다시 제출', superseded: '이전 제출' };
export default function WorkMinutesScreen() {
  const { user, devPreviewEmployeeId, devPreviewMode, realRole } = useAuth();
  const { employees, loading: employeeLoading, error: employeeError, refetch: refetchEmployees } = useEmployees();
  useEffect(() => { void refetchEmployees(); }, [refetchEmployees]);
  const employee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const preview = realRole === 'admin' && devPreviewMode !== 'self';
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  const { rows, loading, error, refetch } = usePayrollSubmissions(month, employee?.id);
  const latest = rows[0];
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (employee) void refetch(); }, [employee?.id, refetch]);
  useEffect(() => { setMinutes(latest ? String(latest.worked_minutes) : ''); setNote(latest?.note ?? ''); }, [month, latest?.id]);
  const dirty = minutes !== (latest ? String(latest.worked_minutes) : '') || note !== (latest?.note ?? '');
  useConfirmLeave(dirty && !saving);
  function changeMonth(offset: number) {
    const move = () => {
      const [year, value] = month.split('-').map(Number);
      const date = new Date(year, value - 1 + offset, 1);
      setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    };
    if (dirty) Alert.alert('월을 변경할까요?', '작성 중인 내용은 저장되지 않아요.', [{ text: '취소', style: 'cancel' }, { text: '변경', onPress: move }]);
    else move();
  }
  async function submit() {
    if (!employee || preview || employee.user_id !== user?.id) return;
    setSaving(true);
    try {
      await submitWorkMinutes(employee.id, month, minutes, note, latest?.id);
      await refetch();
      Alert.alert('제출 완료', '관리자 확인 대기 상태로 제출했어요. 확인 전에는 급여 금액이 바뀌지 않아요.');
    } catch (e) { Alert.alert('제출 실패', getErrorMessage(e, '다시 시도해 주세요.')); }
    finally { setSaving(false); }
  }
  const eligible = employee?.employment_type === 'part_time';
  return <SafeAreaView style={styles.container}>
    <AppBar title="근무시간 제출" onBack={() => router.back()} />
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {employeeLoading ? <LoadingSpinner /> : employeeError ? <ErrorMessage message={employeeError} onRetry={refetchEmployees} /> : !eligible ? <Text style={styles.hint}>연결된 파트타이머 정보가 없어요. 관리자에게 직원 계정 연결을 요청해 주세요.</Text> : <>
        <Text style={styles.title}>{employee.name}님의 월별 근무시간</Text>
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => changeMonth(-1)} disabled={saving} accessibilityRole="button" accessibilityLabel="이전 달" style={styles.nav}><Text>‹</Text></TouchableOpacity>
          <Text style={styles.title}>{month}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} disabled={saving || month >= `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`} accessibilityRole="button" accessibilityLabel="다음 달" style={styles.nav}><Text>›</Text></TouchableOpacity>
        </View>
        {preview && <Text style={styles.hint}>미리보기에서는 직원 명의로 제출할 수 없어요.</Text>}
        {error && <ErrorMessage message={error} onRetry={refetch} />}
        {loading ? <LoadingSpinner /> : <>
          {latest && <Text style={styles.status}>{STATUS[latest.status]} · {formatWorkedMinutes(latest.worked_minutes)}</Text>}
          {latest?.review_note && <Text style={styles.hint}>관리자 메모: {latest.review_note}</Text>}
          <Field label="총 실근무 시간 (분)" accessibilityLabel="총 실근무 시간 (분)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" placeholder="예: 9600" editable={!saving && !preview} helpText="160시간 = 9,600분. 근무하지 않은 달은 0분으로 입력해요." />
          <Field label="입력 근거 / 수정 사유" value={note} onChangeText={setNote} maxLength={1000} multiline placeholder="예: 10월 근무 합계, 휴게시간 제외" editable={!saving && !preview} />
          <Button label={latest ? '수정 내용 다시 제출' : '관리자에게 제출'} onPress={submit} loading={saving} disabled={saving || preview || !!error || (!!latest && !dirty)} />
          <Text style={styles.hint}>시급·공제·최종 급여는 관리자가 확인해 반영해요. 확인 후 재제출하면 기존 정산 확정이 해제되고 다시 확인을 받아요.</Text>
          <Text style={styles.title}>제출 이력</Text>
          {rows.map(row => <View key={row.id} style={styles.history}>
            <Text>{STATUS[row.status]} · {formatWorkedMinutes(row.worked_minutes)}</Text>
            <Text style={styles.hint}>{new Date(row.submitted_at).toLocaleString('ko-KR')} · {row.note}</Text>
            {row.review_note && <Text style={styles.hint}>관리자: {row.review_note}</Text>}
          </View>)}
        </>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white }, content: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black }, hint: { fontSize: 13, lineHeight: 21, color: Colors.gray600 },
  status: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, nav: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  history: { paddingVertical: 12, gap: 6, borderBottomWidth: 0.5, borderBottomColor: Colors.gray200 },
});
