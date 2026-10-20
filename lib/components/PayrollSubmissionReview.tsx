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
  const { rows, error, refetch } = usePayrollSubmissions(yearMonth);
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
        if (employee) await onApply(employee, saved);
      }
    } catch (e) { Alert.alert('확인 실패', getErrorMessage(e, '다시 시도해 주세요.')); }
    finally { setSaving(null); }
  }
  return <View style={styles.section}>
    <Text style={styles.title}>파트타이머 근무시간 제출</Text>
    <Text style={styles.hint}>본인 제출 → 관리자 확인 → 시급·공제 확인 후 급여 반영</Text>
    {error && <ErrorMessage message={error} onRetry={refetch} />}
    {!error && latest.size === 0 && <Text style={styles.hint}>아직 제출된 근무시간이 없어요. 파트타이머에게 홈의 ‘근무시간 제출’을 안내해 주세요.</Text>}
    {[...latest.values()].map(row => {
      const employee = employees.find(employee => employee.id === row.employee_id);
      const applied = payrolls.some(payroll => payroll.employee_id === row.employee_id && payroll.work_submission_id === row.id);
      return <View key={row.id} style={styles.row}>
        <Text style={styles.name}>{employee?.name ?? '직원'} · {formatWorkedMinutes(row.worked_minutes)}</Text>
        <Text style={styles.hint}>{row.note}</Text>
        <Text style={styles.status}>{row.status === 'pending' ? '확인 대기' : row.status === 'approved' ? applied ? '급여 반영 완료' : '확인 완료 · 급여 반영 대기' : '반려 · 재제출 대기'}</Text>
        {row.review_note && <Text style={styles.hint}>관리자 메모: {row.review_note}</Text>}
        {row.status === 'pending' && <>
          <TextInput style={styles.input} placeholder="확인 메모 / 반려 사유" placeholderTextColor={Colors.gray400}
            value={notes[row.id] ?? ''} onChangeText={value => setNotes(previous => ({ ...previous, [row.id]: value }))} maxLength={1000} multiline editable={saving === null} />
          <View style={styles.buttons}>
            <Button label="확인 후 급여 작성" onPress={() => void review(row, 'approved')} disabled={saving !== null} />
            <Button label="반려" variant="secondary" onPress={() => void review(row, 'rejected')} disabled={saving !== null} />
          </View>
        </>}
        {row.status === 'approved' && !applied && employee && <Button label="급여에 반영" onPress={() => void onApply(employee, row)} disabled={saving !== null} />}
      </View>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  section: { gap: 10 }, title: { fontSize: 16, fontWeight: '700', color: Colors.black },
  hint: { fontSize: 12, lineHeight: 19, color: Colors.gray600 }, status: { fontSize: 12, fontWeight: '600', color: Colors.primary },
  row: { gap: 10, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: Colors.gray200 },
  name: { fontSize: 14, fontWeight: '600', color: Colors.black }, buttons: { gap: 8 },
  input: { borderWidth: 1, borderColor: Colors.gray200, borderRadius: 10, padding: 12, minHeight: 44, color: Colors.black },
});
