import { getErrorMessage } from '../utils/error';
import { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { Employee, Payroll, PayrollWorkSubmission } from '../../types';
import { usePayrollSubmissions } from '../hooks/usePayrollSubmissions';
import { reviewWorkMinutes } from '../services/payrollSubmissions';
import { formatWorkedMinutes } from '../utils/workMinutes';
import { Button } from './ui';
import { ErrorMessage } from './ErrorMessage';

export function PayrollSubmissionReview({ yearMonth, active, employees, payrolls, onApply }: {
  yearMonth: string; active: boolean; employees: Employee[]; payrolls: Payroll[];
  onApply: (employee: Employee, submission: PayrollWorkSubmission) => Promise<void>;
}) {
  const { rows, loading, error, refetch } = usePayrollSubmissions(yearMonth);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (active) void refetch(); }, [active, refetch]);
  const latest = new Map<string, PayrollWorkSubmission>();
  for (const row of rows) if (!latest.has(row.employee_id)) latest.set(row.employee_id, row);
  async function review(row: PayrollWorkSubmission, status: 'approved' | 'rejected') {
    if (saving) return;
    setSaving(row.id);
    try {
      const saved = await reviewWorkMinutes(row.id, status, notes[row.id] ?? '');
      await refetch();
      if (status === 'approved' && mounted.current) {
        const employee = employees.find(employee => employee.id === saved.employee_id);
        Alert.alert('제출 확인 완료', '제출 확인은 저장됐어요. 시급·공제를 검토한 뒤 급여에 반영해 주세요.', [
          { text: '나중에', style: 'cancel' },
          ...(employee ? [{ text: '급여 검토', onPress: () => { void onApply(employee, saved).catch(() => Alert.alert('제출 확인 완료', '급여 검토를 열지 못했어요. 제출 내역에서 다시 열어 주세요.')); } }] : []),
        ]);
      }
    } catch (e) { Alert.alert('확인 실패', getErrorMessage(e, '다시 시도해 주세요.')); }
    finally { setSaving(null); }
  }
  if (!loading && !error && latest.size === 0) return null;
  return <View style={styles.section}>
    <Text style={styles.title}>기존 월 합계 제출</Text>
    {error && <ErrorMessage message={error} onRetry={refetch} />}
    {loading && <Text style={styles.hint}>제출 내역을 불러오는 중이에요.</Text>}
    {[...latest.values()].map(row => {
      const employee = employees.find(employee => employee.id === row.employee_id);
      const payroll = payrolls.find(payroll => payroll.employee_id === row.employee_id);
      const applied = payroll?.work_submission_id === row.id;
      return <View key={row.id} style={styles.row}>
        <Text style={styles.name}>{employee?.name ?? '직원'} · {formatWorkedMinutes(row.worked_minutes)}</Text>
        <Text style={styles.hint}>{yearMonth} · 제출 버전 {row.version} · {new Date(row.submitted_at).toLocaleString('ko-KR')}</Text><Text style={styles.hint}>{row.note}</Text>
        <Text style={styles.status}>{row.status === 'pending' ? '확인 대기' : row.status === 'approved' ? applied ? payroll?.is_settled ? '급여 반영 완료 · 정산 확정' : '급여 반영 완료 · 정산 미확정' : '확인 완료 · 급여 반영 대기' : '반려 · 재제출 대기'}</Text>
        {row.status === 'pending' && payroll && payroll.work_submission_id !== row.id && <Text style={styles.hint}>새 제출을 검토하기 전까지 기존 급여 금액은 유지돼요. 정산 확정 여부를 다시 확인해 주세요.</Text>}
        {applied && !payroll?.is_settled && <Text style={styles.hint}>급여 명세와 공제를 확인한 뒤 ‘정산’을 눌러 확정해 주세요.</Text>}
        {row.review_note && <Text style={styles.hint}>관리자 메모: {row.review_note}</Text>}
        {row.status === 'pending' && <>
          <TextInput style={styles.input} placeholder="확인 메모 / 반려 사유" placeholderTextColor={Colors.gray400}
            value={notes[row.id] ?? ''} onChangeText={value => setNotes(previous => ({ ...previous, [row.id]: value }))} maxLength={1000} multiline editable={saving === null} />
          <View style={styles.buttons}>
            <Button label="제출 확인 후 급여 검토" onPress={() => void review(row, 'approved')} disabled={saving !== null} />
            <Button label="반려" variant="secondary" onPress={() => void review(row, 'rejected')} disabled={saving !== null} />
          </View>
        </>}
        {row.status === 'approved' && !applied && employee && <Button label="시급·공제 검토 후 급여 반영" onPress={() => void onApply(employee, row)} disabled={saving !== null} />}
      </View>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 10, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.homeBorder, borderRadius: 20, padding: 16 }, title: { fontSize: 17, fontWeight: '700', color: Colors.black },
  hint: { fontSize: 12, lineHeight: 19, color: Colors.gray600 }, status: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  row: { gap: 10, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.gray200 },
  name: { fontSize: 14, fontWeight: '600', color: Colors.black }, buttons: { gap: 8 },
  input: { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, padding: 12, minHeight: 44, color: Colors.black },
});
