import { DailyWorkPanel } from './DailyWorkPanel';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getErrorMessage, UserFacingError } from '../utils/error';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Employee, Payroll, PayrollWorkHistory, PayrollWorkSubmission } from '../../types';
import { Colors } from '../../constants/colors';
import { getPayrollWorkHistory, probationFactor, WorkedMinutesInput } from '../services/payroll';
import { calculateHourlyGross, formatWorkedMinutes, parseWorkedMinutes } from '../utils/workMinutes';
import { Button, Field } from './ui';
import { ErrorMessage } from './ErrorMessage';
import { LoadingSpinner } from './LoadingSpinner';

export function LegacyWorkMinutesForm({ storeId, employee, payroll: initialPayroll, yearMonth, onClose, onSave, submission }: {
  storeId: string; employee: Employee; payroll?: Payroll; yearMonth: string;
  onClose: () => void;
  onSave: (input: WorkedMinutesInput, previous?: Payroll) => Promise<unknown>;
  submission?: PayrollWorkSubmission;
}) {
  // 폼을 연 시점의 revision을 유지해 뒤에서 조회된 최신값으로 충돌 검사를 우회하지 않는다.
  const [payroll] = useState(initialPayroll);
  const isPart = employee.employment_type === 'part_time';
  const [minutes, setMinutes] = useState(submission ? String(submission.worked_minutes) : payroll?.worked_minutes == null ? '' : String(payroll.worked_minutes));
  const [rate, setRate] = useState(String(payroll?.applied_hourly_wage ?? Number(((employee.hourly_wage ?? 0) * probationFactor(employee)).toFixed(4))));
  const [note, setNote] = useState(submission?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PayrollWorkHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    getPayrollWorkHistory(storeId, employee.id, yearMonth)
      .then(rows => { if (!cancelled) setHistory(rows); })
      .catch(e => { if (!cancelled) setHistoryError(getErrorMessage(e)); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [storeId, employee.id, yearMonth, reload]);

  let preview: string | null = null;
  try {
    const parsed = parseWorkedMinutes(minutes, yearMonth);
    preview = formatWorkedMinutes(parsed);
    if (isPart) preview += ` · 세전 ${calculateHourlyGross(parsed, Number(rate)).toLocaleString()}원`;
  } catch { /* 입력 중에는 미리보기를 숨기고 제출 시 오류를 표시한다. */ }

  async function save() {
    setError(null);
    try {
      parseWorkedMinutes(minutes, yearMonth);
      if (!note.trim()) throw new UserFacingError('입력 근거 또는 수정 사유를 적어주세요.');
      if (isPart) calculateHourlyGross(Number(minutes), Number(rate));
    } catch (e) { setError(getErrorMessage(e)); return; }
    const performSave = async () => {
      setSaving(true);
      try {
        await onSave({ minutes, hourlyWage: isPart ? Number(rate) : null, note, ...(submission ? { submissionId: submission.id } : {}) }, payroll);
        onClose();
        Alert.alert('저장 완료', '근무시간을 저장했어요.');
      } catch (e) { setError(getErrorMessage(e)); }
      finally { setSaving(false); }
    };
    if (payroll) {
      Alert.alert('근무시간을 저장할까요?', isPart
        ? '적용 시급과 입력 분으로 급여·공제를 다시 계산하고 정산 확정을 해제합니다.'
        : '월급·공제 금액은 유지하고 근무시간을 기록합니다. 정산 확정은 해제됩니다.',
      [{ text: '취소', style: 'cancel' }, { text: '저장', onPress: performSave }]);
    } else { await performSave(); }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={() => { if (!saving) onClose(); }}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{employee.name} · 근무시간 입력</Text>
          {submission && <Text style={styles.hint}>직원이 제출하고 관리자가 확인한 근무시간이에요. 적용 시급과 공제를 대조한 뒤 급여에 반영해 주세요.</Text>}
          <Field accessibilityLabel="총 근무시간 (분)" label="총 근무시간 (분)" value={minutes} onChangeText={setMinutes}
            keyboardType="number-pad" placeholder="예: 9600" editable={!saving && !submission}
            helpText="휴게시간을 뺀 실제 근무 분을 입력하세요. 미근무는 0분으로 기록해요." />
          {isPart && <Field accessibilityLabel="적용 시급 (원)" label="적용 시급 (원)" value={rate} onChangeText={setRate}
            keyboardType="decimal-pad" editable={!saving}
            helpText="수습 등 실제 지급 조건을 반영한 시급이에요. 월중 변경 시 기간별 세전 합계 ÷ 총 근무 분 × 60을 입력하고 미리보기 금액을 대조하세요. 소수 넷째 자리까지 입력할 수 있어요." />}
          {preview && <Text style={styles.preview}>{preview}</Text>}
          {!isPart && <Text style={styles.hint}>정규직은 근무 분을 대조용으로 보관하며, 월급은 기존 계산을 유지해요.</Text>}
          <Field accessibilityLabel="입력 근거 또는 수정 사유" label="입력 근거 / 수정 사유" value={note} onChangeText={setNote}
            placeholder="예: 10월 근무 집계표 기준, 휴게 600분 제외" multiline maxLength={1000} editable={!saving} />
          {payroll?.work_note && <Text style={styles.hint}>이전 메모: {payroll.work_note}</Text>}
          {payroll?.work_source === 'legacy_attendance' && <Text style={styles.hint}>기존 출퇴근 기록에서 이전한 내역이에요. 첫 저장 시 입력 시급과 공제를 확인해주세요.</Text>}
          {error && <ErrorMessage message={error} />}
          <Button label="근무시간 저장" onPress={save} loading={saving} disabled={saving || historyLoading || !!historyError} />
          <Button label="닫기" variant="secondary" onPress={onClose} disabled={saving} />
          <Text style={styles.title}>작성·수정 이력</Text>
          {historyLoading ? <LoadingSpinner /> : historyError
            ? <ErrorMessage message={historyError} onRetry={() => setReload(n => n + 1)} />
            : history.length === 0 ? <Text style={styles.hint}>아직 작성 이력이 없어요.</Text>
            : history.map(row => (
              <View key={row.id} style={styles.historyRow}>
                <Text style={styles.hint}>{new Date(row.changed_at).toLocaleString('ko-KR')}
                  {' · '}{row.operation === 'DELETE' ? '삭제' : row.operation === 'INSERT' ? '작성' : '수정'}</Text>
                <Text style={styles.historyText}>{row.old_record ? formatWorkedMinutes(row.old_record.worked_minutes) : '작성 전'}
                  {' → '}{row.new_record ? formatWorkedMinutes(row.new_record.worked_minutes) : '삭제됨'}</Text>
                <Text style={styles.hint}>세전 {Number(row.old_record?.gross ?? 0).toLocaleString()}원 → {Number(row.new_record?.gross ?? 0).toLocaleString()}원</Text>
                <Text style={styles.hint}>{row.new_record?.work_note ?? row.old_record?.work_note}</Text>
                <Text selectable style={styles.hint}>작성 계정: {row.changed_by ?? '기존 자료 이전'}</Text>
              </View>
            ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas},
  content: { padding: 20, paddingTop: 60, paddingBottom: 40, gap: 16 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.black, flexShrink: 1 },
  hint: { fontSize: 13, lineHeight: 20, color: Colors.gray500 },
  preview: { fontSize: 15, fontWeight: '600', color: Colors.primary, borderRadius: 24, borderWidth: 1, borderColor: Colors.homeBorder, backgroundColor: Colors.white, padding: 20 },
  historyRow: { gap: 4, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.homeBorder, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, backgroundColor: Colors.white, padding: 16 },
  historyText: { fontSize: 13, color: Colors.black },
});


/** Old monthly submissions retain their original application path; new part-time entry is daily. */
export function WorkMinutesForm(props: {
  storeId: string; employee: Employee; payroll?: Payroll; yearMonth: string;
  onClose: () => void; onSave: (input: WorkedMinutesInput, previous?: Payroll) => Promise<unknown>;
  submission?: PayrollWorkSubmission; onDailyApplied?: () => Promise<unknown>;
}) {
  const [closeRequest, setCloseRequest] = useState(0);
  if (props.employee.employment_type !== 'part_time' || props.submission) return <LegacyWorkMinutesForm {...props} />;
  return <Modal visible animationType="slide" onRequestClose={() => setCloseRequest(value => value + 1)}>
    <SafeAreaView style={styles.container}>
      <DailyWorkPanel key={`${props.employee.id}:${props.yearMonth}`} employee={props.employee} yearMonth={props.yearMonth} payroll={props.payroll} isAdmin closeRequested={closeRequest} onApplied={props.onDailyApplied} onClose={props.onClose} />
    </SafeAreaView>
  </Modal>;
}
