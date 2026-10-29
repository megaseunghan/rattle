import { DailyWorkPanel } from '../../lib/components/DailyWorkPanel';
/* Hallmark · genre: modern-minimal · design-system: DESIGN.md · designed-as-app */
import { getErrorMessage } from '../../lib/utils/error';
import { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { usePayrollSubmissions } from '../../lib/hooks/usePayrollSubmissions';
import { submitWorkMinutes } from '../../lib/services/payrollSubmissions';
import { formatWorkedMinutes, parseWorkedMinutes } from '../../lib/utils/workMinutes';
import { resolveSelfEmployee } from '../../lib/utils/resolveSelfEmployee';
import { AppBar, Button, Field } from '../../lib/components/ui';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';

const STATUS = { pending: '관리자 확인 대기', approved: '관리자 확인 완료', rejected: '수정 후 다시 제출', superseded: '이전 제출' };
export function LegacyWorkMinutesScreen({ readOnly = false }: { readOnly?: boolean }) {
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
  const [fieldErrors, setFieldErrors] = useState<{ minutes?: string; note?: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [baseline, setBaseline] = useState({ minutes: '', note: '' });
  const initialized = useRef('');
  const savingLock = useRef(false);
  const draftScope = `${user?.id}:${employee?.id}:${month}`;
  const scopeRef = useRef(draftScope);
  scopeRef.current = draftScope;
  useEffect(() => () => { scopeRef.current = ''; }, []);
  useEffect(() => { if (employee) void refetch(); }, [employee?.id, refetch]);
  useEffect(() => {
    initialized.current = '';
    setMinutes(''); setNote(''); setBaseline({ minutes: '', note: '' });
    setFieldErrors({}); setSubmitted(false);
  }, [draftScope]);
  useEffect(() => {
    if (loading || error || !employee || initialized.current === draftScope) return;
    const initial = { minutes: latest ? String(latest.worked_minutes) : '', note: latest?.note ?? '' };
    setMinutes(initial.minutes); setNote(initial.note); setBaseline(initial);
    initialized.current = draftScope;
  }, [draftScope, loading, error, latest, employee]);
  const dirty = minutes !== baseline.minutes || note !== baseline.note;
  useConfirmLeave(dirty || saving, { blockLeave: saving });
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
    if (readOnly || !employee || preview || employee.user_id !== user?.id || savingLock.current || loading || error || employeeLoading || employeeError) return;
    const errors: { minutes?: string; note?: string } = {};
    try { parseWorkedMinutes(minutes, month); }
    catch (e) { errors.minutes = getErrorMessage(e, '총 실근무 시간을 확인해 주세요.'); }
    if (!note.trim()) errors.note = '입력 근거나 수정 사유를 적어 주세요.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    savingLock.current = true;
    setSaving(true);
    let saved = false;
    try {
      await submitWorkMinutes(employee.id, month, minutes, note, latest?.id);
      if (scopeRef.current !== draftScope) return;
      saved = true;
      setSubmitted(true); setBaseline({ minutes, note }); Keyboard.dismiss();
      const refreshed = await refetch();
      if (scopeRef.current === draftScope) Alert.alert('제출 완료', refreshed === false ? '제출은 완료됐어요. 제출 이력을 다시 불러와 주세요.' : '관리자 확인 대기 상태로 제출했어요. 확인 전에는 급여 금액이 바뀌지 않아요.');
    } catch (e) {
      if (scopeRef.current === draftScope) Alert.alert(saved ? '제출 완료' : '제출 실패', saved ? '제출은 완료됐어요. 제출 이력을 다시 불러와 주세요.' : getErrorMessage(e, '입력한 내용은 유지돼요. 다시 시도해 주세요.'));
    }
    finally { savingLock.current = false; setSaving(false); }
  }
  const eligible = employee?.employment_type === 'part_time';
  return <SafeAreaView style={styles.container}>
    <AppBar title="근무시간 제출" onBack={() => router.back()} />
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
      {employeeLoading ? <LoadingSpinner /> : employeeError ? <ErrorMessage message={employeeError} onRetry={refetchEmployees} /> : !eligible ? <Text style={styles.hint}>연결된 파트타이머 정보가 없어요. 관리자에게 직원 계정 연결을 요청해 주세요.</Text> : <>
        <Text style={styles.title}>{employee.name}님의 월별 근무시간</Text>
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => changeMonth(-1)} disabled={saving} accessibilityRole="button" accessibilityLabel="이전 달" style={styles.nav}><Text>‹</Text></TouchableOpacity>
          <Text style={styles.title}>{month}</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} disabled={saving || month >= `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`} accessibilityRole="button" accessibilityLabel="다음 달" style={styles.nav}><Text>›</Text></TouchableOpacity>
        </View>
        {readOnly && <Text style={styles.hint}>기존 월 합계 제출 이력이에요. 새 기록은 일별 근무시간에서 입력해 주세요.</Text>}
        {preview && <Text style={styles.hint}>미리보기에서는 직원 명의로 제출할 수 없어요.</Text>}
        {error && <ErrorMessage message={error} onRetry={refetch} />}
        {loading ? <LoadingSpinner /> : <>
          {latest && <Text style={styles.status}>{STATUS[latest.status]} · {formatWorkedMinutes(latest.worked_minutes)}</Text>}
          {latest?.review_note && <Text style={styles.hint}>관리자 메모: {latest.review_note}</Text>}
          {submitted && !dirty && <Text style={styles.status}>제출 완료 · 관리자 확인 대기</Text>}
          <Field label="총 실근무 시간 (분) *" accessibilityLabel="총 실근무 시간 (분)" value={minutes} onChangeText={value => { setMinutes(value); setFieldErrors(previous => ({ ...previous, minutes: undefined })); }} keyboardType="number-pad" placeholder="예: 9600" editable={!readOnly && !saving && !preview && !error} helpText="160시간 = 9,600분. 근무하지 않은 달은 0분으로 입력해요." />
          {/^\d+$/.test(minutes.trim()) && Number.isSafeInteger(Number(minutes)) && <Text style={styles.hint}>입력한 시간: {formatWorkedMinutes(Number(minutes))}</Text>}
          {fieldErrors.minutes && <Text style={styles.fieldError} accessibilityRole="alert">{fieldErrors.minutes}</Text>}
          <Field label="입력 근거 / 수정 사유 *" accessibilityLabel="입력 근거 / 수정 사유" value={note} onChangeText={value => { setNote(value); setFieldErrors(previous => ({ ...previous, note: undefined })); }} maxLength={1000} multiline placeholder="예: 10월 근무 합계, 휴게시간 제외" editable={!readOnly && !saving && !preview && !error} />
          {fieldErrors.note && <Text style={styles.fieldError} accessibilityRole="alert">{fieldErrors.note}</Text>}
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
    {eligible && !employeeLoading && !employeeError && <View style={styles.footer}>
      <Button label={submitted && !dirty ? '제출 완료 · 관리자 확인 대기' : latest || submitted ? '수정 내용 다시 제출' : '관리자에게 제출'} onPress={submit} loading={saving} disabled={readOnly || saving || loading || preview || !!error || ((!!latest || submitted) && !dirty)} />
    </View>}
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, footer: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.homeBorder, backgroundColor: Colors.white },
  fieldError: { color: Colors.negative, backgroundColor: Colors.fieldErrorBg, padding: 12, borderRadius: 12, fontSize: 13, lineHeight: 20 },
  container: { flex: 1, backgroundColor: Colors.homeCanvas }, content: { padding: 20, gap: 16, paddingBottom: 40 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.black }, hint: { fontSize: 13, lineHeight: 21, color: Colors.gray600 },
  status: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, nav: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  history: { padding: 16, gap: 6, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 20 },
});


export default function WorkMinutesScreen() {
  const { user, devPreviewEmployeeId, devPreviewMode, realRole } = useAuth();
  const { employees, loading, error, refetch } = useEmployees();
  useEffect(() => { void refetch(); }, [refetch]);
  const employee = resolveSelfEmployee(employees, user?.id, devPreviewEmployeeId);
  const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7);
  const [month, setMonth] = useState(today);
  const [legacy, setLegacy] = useState(false);
  const [busy, setBusy] = useState(false);
  const preview = realRole === 'admin' && devPreviewMode !== 'self';
  if (legacy) return <LegacyWorkMinutesScreen readOnly />;
  function move(offset: number) {
    const [year, value] = month.split('-').map(Number);
    const date = new Date(Date.UTC(year, value - 1 + offset, 1));
    // Confirm because switching month discards the current unsaved day draft.
    Alert.alert('월을 변경할까요?', '저장하지 않은 일별 입력은 유지되지 않아요.', [{ text: '취소', style: 'cancel' }, { text: '변경', onPress: () => setMonth(date.toISOString().slice(0, 7)) }]);
  }
  return <SafeAreaView style={styles.container}>
    <AppBar title="일별 근무시간" onBack={() => router.back()} />
    {loading ? <LoadingSpinner /> : error ? <ErrorMessage message={error} onRetry={refetch} /> : !employee || employee.employment_type !== 'part_time' ? <Text style={styles.hint}>연결된 파트타이머 정보가 없어요. 관리자에게 계정 연결을 요청해 주세요.</Text> : <>
      <View style={[styles.monthRow, { paddingHorizontal: 16 }]}>
        <Button label="이전 달" variant="text" onPress={() => move(-1)} disabled={busy} />
        <Text style={styles.title}>{month}</Text>
        <Button label="다음 달" variant="text" onPress={() => move(1)} disabled={busy || month >= today} />
      </View>
      <DailyWorkPanel key={`${employee.id}:${month}`} employee={employee} yearMonth={month} isAdmin={false} onBusyChange={setBusy} readOnly={preview || employee.user_id !== user?.id} />
      <Button label="기존 월 합계 제출 이력" variant="text" disabled={busy} onPress={() => Alert.alert('이전 월 합계 기록을 열까요?', '저장하지 않은 일별 입력은 유지되지 않아요.', [{ text: '취소', style: 'cancel' }, { text: '열기', onPress: () => setLegacy(true) }])} />
    </>}
  </SafeAreaView>;
}
