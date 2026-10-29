import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Employee, Payroll, DailyWorkHistory, DailyWorkRecord } from '../../types';
import { Colors } from '../../constants/colors';
import { useDailyWork } from '../hooks/useDailyWork';
import { applyDailyPayroll, dailyWorkTotals, getDailyWorkHistory, parseDailyMinutes, reviewDailyWork, saveDailyWork } from '../services/dailyWork';
import { getMyPayroll } from '../services/payroll';
import { getErrorMessage } from '../utils/error';
import { formatWorkedMinutes } from '../utils/workMinutes';
import { Button, Field } from './ui';
import { ErrorMessage } from './ErrorMessage';
import { LoadingSpinner } from './LoadingSpinner';
import { useConfirmLeave } from '../hooks/useConfirmLeave';

const labels = { pending: '관리자 확인 대기', approved: '확인 완료', rejected: '수정 필요' };
const kstToday = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
export function DailyWorkPanel({ employee, yearMonth, payroll, isAdmin, readOnly = false, onApplied, onClose, closeRequested = 0, onBusyChange }: {
  employee: Employee; yearMonth: string; payroll?: Payroll; isAdmin: boolean; readOnly?: boolean;
  onApplied?: () => Promise<unknown>; onClose?: () => void; closeRequested?: number; onBusyChange?: (value: boolean) => void;
}) {
  const { rows, loading, error, refetch } = useDailyWork(employee.store_id, employee.id, yearMonth);
  const [date, setDate] = useState(kstToday().startsWith(yearMonth) ? kstToday() : `${yearMonth}-01`);
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [target, setTarget] = useState<DailyWorkRecord | null>(null);
  const [baseline, setBaseline] = useState({ minutes: '', note: '' });
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<DailyWorkHistory[] | null>(null);
  const [savedPayroll, setSavedPayroll] = useState(payroll);
  const [payrollLoaded, setPayrollLoaded] = useState(!isAdmin);
  const payrollRequest = useRef(0);
  const refreshPayroll = useCallback(async () => {
    if (!isAdmin) return true;
    const request = ++payrollRequest.current;
    setPayrollLoaded(false);
    try {
      const saved = await getMyPayroll(employee.id, yearMonth);
      if (request !== payrollRequest.current) return false;
      setSavedPayroll(saved ?? undefined); setPayrollLoaded(true); return true;
    } catch { return false; }
  }, [employee.id, yearMonth, isAdmin]);
  useEffect(() => { void refreshPayroll(); return () => { payrollRequest.current++; }; }, [refreshPayroll]);
  const totals = dailyWorkTotals(rows);
  const dirty = minutes !== baseline.minutes || note !== baseline.note;
  const bypass = useConfirmLeave(dirty || busy, { blockLeave: busy });
  const scroll = useRef<ScrollView>(null);
  function select(row: DailyWorkRecord | null) {
    const change = () => {
      setTarget(row); setMinutes(row ? String(row.worked_minutes) : ''); setNote(row?.note ?? '');
      setDate(row?.work_date ?? (kstToday().startsWith(yearMonth) ? kstToday() : `${yearMonth}-01`));
      setBaseline({ minutes: row ? String(row.worked_minutes) : '', note: row?.note ?? '' }); setHistory(null); setMessage(null);
      scroll.current?.scrollTo({ y: 0, animated: true });
    };
    if (dirty) Alert.alert('작성 중인 내용을 바꿀까요?', '저장하지 않은 입력은 사라져요.', [{ text: '계속 작성', style: 'cancel' }, { text: '바꾸기', onPress: change }]); else change();
  }
  async function save() {
    if (readOnly || lock.current || loading || error) return;
    try { if (!date.startsWith(`${yearMonth}-`)) throw new Error('선택한 월의 날짜를 입력해 주세요.'); if (date > kstToday()) throw new Error('미래 날짜의 근무시간은 입력할 수 없어요.'); parseDailyMinutes(minutes); if (!note.trim()) throw new Error('입력 근거나 수정 사유를 적어 주세요.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : '입력값을 확인해 주세요.'); return; }
    lock.current = true; setBusy(true); setMessage(null);
    try {
      const saved = await saveDailyWork(employee.id, date, minutes, note, target?.revision);
      setTarget(saved); setBaseline({ minutes, note }); Keyboard.dismiss();
      const loaded = await refetch();
      await refreshPayroll();
      try { await onApplied?.(); } catch { /* Daily save already committed; keep its success message. */ }
      setMessage(loaded ? isAdmin ? '일별 기록을 저장했어요. 월 급여 반영은 아래에서 진행해 주세요.' : '관리자 확인 대기로 제출했어요.' : '저장은 완료됐어요. 목록을 다시 불러와 주세요.');
    } catch (e) { setMessage(getErrorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function review(row: DailyWorkRecord, status: 'approved' | 'rejected') {
    if (readOnly || lock.current) return;
    lock.current = true; setBusy(true); setMessage(null);
    try {
      const saved = await reviewDailyWork(row, status, reviewNotes[row.id] ?? '');
      if (target?.id === row.id) setTarget(saved);
      const loaded = await refetch(); await refreshPayroll();
      try { await onApplied?.(); } catch { /* Review already committed. */ }
      setMessage(loaded ? '확인 상태를 저장했어요.' : '확인은 저장됐어요. 목록을 다시 불러와 주세요.');
    } catch (e) { setMessage(getErrorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function apply() {
    if (readOnly || lock.current) return;
    lock.current = true; setBusy(true); setMessage(null);
    try {
      const saved = await applyDailyPayroll(employee, yearMonth, rows, savedPayroll);
      setSavedPayroll(saved);
      try { await onApplied?.(); setMessage(saved.cacheRefreshFailed ? '급여에 반영됐어요. 화면을 다시 불러와 주세요.' : '월 급여에 반영했어요. 공제와 명세를 확인한 뒤 정산을 확정해 주세요.'); }
      catch { setMessage('급여에 반영됐어요. 급여 목록을 다시 불러와 주세요.'); }
    } catch (e) { setMessage(getErrorMessage(e)); }
    finally { lock.current = false; setBusy(false); }
  }
  function close() {
    if (busy) return;
    if (dirty) Alert.alert('저장하지 않고 닫을까요?', '작성 중인 근무시간은 저장되지 않아요.', [{ text: '계속 작성', style: 'cancel' }, { text: '닫기', onPress: () => { bypass(); onClose?.(); } }]);
    else onClose?.();
  }
  useEffect(() => { if (closeRequested) close(); }, [closeRequested]);
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
      <Text style={styles.title}>{employee.name} · {yearMonth} 일별 근무시간</Text>
      <Text style={styles.hint}>휴게시간을 뺀 실근무 분을 입력해요. 그날의 시급으로 계산한 금액을 기록하고 월별로 합산해요.</Text>
      {readOnly && <Text style={styles.hint}>미리보기에서는 입력하거나 제출할 수 없어요.</Text>}
      {error && <ErrorMessage message={error} onRetry={refetch} />}
      {loading && <LoadingSpinner fullScreen={false} />}
      <View style={styles.card}>
        <Text style={styles.title}>확인된 근무 {loading ? '불러오는 중' : error ? '조회 실패' : formatWorkedMinutes(totals.minutes)}</Text>
        <Text style={styles.amount}>{loading ? '불러오는 중' : error ? '조회 실패' : `세전 ${totals.gross.toLocaleString()}원`}</Text>
        {!loading && !error && <Text style={styles.hint}>확인 대기·수정 필요 {totals.pending}일 · 월 급여에 반영하기 전 합계예요.</Text>}
      </View>
      {isAdmin && !payrollLoaded && <Button label="월 급여 다시 불러오기" variant="text" onPress={() => void refreshPayroll()} disabled={busy} />}
      {savedPayroll && <Text style={styles.hint}>현재 작성된 월 급여 {Number(savedPayroll.gross).toLocaleString()}원{!savedPayroll.daily_work_snapshot ? ' · 기존 월 합계 기록은 일별로 나누지 않고 보존돼요.' : ''}</Text>}
      <View style={styles.card}>
        <Text style={styles.title}>{target ? `${target.work_date} 수정` : '하루 근무시간 입력'}</Text>
        <Field label="근무일" accessibilityLabel="근무일" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" maxLength={10} editable={!target && !busy && !readOnly} keyboardType="numbers-and-punctuation" />
        <Field label="실근무 시간 (분)" accessibilityLabel="실근무 시간 (분)" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" placeholder="예: 480" editable={!busy && !readOnly} helpText="8시간 = 480분. 근무하지 않은 날은 0분으로 기록할 수 있어요." />
        {target && <Text style={styles.hint}>저장 당시 시급 {Number(target.applied_hourly_wage).toLocaleString()}원 · 시간을 수정해도 이 시급을 유지해요.</Text>}
        <Field label="입력 근거 / 수정 사유" accessibilityLabel="일별 근무 입력 근거" value={note} onChangeText={setNote} placeholder="예: 휴게 60분을 제외한 실근무" multiline maxLength={1000} editable={!busy && !readOnly} />
        {target && <Button label="다른 날짜 입력" variant="text" onPress={() => select(null)} disabled={busy} />}
      </View>
      {message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
      <View style={styles.sectionHeader}><Text style={styles.title}>날짜별 기록</Text><Button label="기록 다시 불러오기" variant="text" onPress={() => void refetch()} disabled={busy || loading} /></View>
      {!loading && !error && rows.length === 0 && <Text style={styles.hint}>아직 기록이 없어요. 근무한 날짜부터 입력해 주세요.</Text>}
      {rows.map(row => <View style={styles.card} key={row.id}>
        <Text style={styles.rowTitle}>{row.work_date.slice(5).replace('-', '/')} · {formatWorkedMinutes(row.worked_minutes)}</Text>
        <Text style={styles.amount}>{Number(row.gross).toLocaleString()}원</Text>
        <Text style={styles.hint}>시급 {Number(row.applied_hourly_wage).toLocaleString()}원 · {labels[row.status]}</Text>
        <Text style={styles.hint}>{row.note}</Text>
        {row.review_note && <Text style={styles.hint}>관리자: {row.review_note}</Text>}
        <Button label={`${row.work_date} 수정`} variant="text" onPress={() => select(row)} disabled={busy || readOnly} />
        {isAdmin && row.status === 'pending' && <>
          <Field label="확인 메모 / 반려 사유" value={reviewNotes[row.id] ?? ''} onChangeText={value => setReviewNotes(old => ({ ...old, [row.id]: value }))} maxLength={1000} editable={!busy && !readOnly} />
          <Button label={`${row.work_date} 확인`} onPress={() => void review(row, 'approved')} disabled={busy || readOnly} />
          <Button label={`${row.work_date} 반려`} variant="secondary" onPress={() => void review(row, 'rejected')} disabled={busy || readOnly} />
        </>}
        <Button label={`${row.work_date} 변경 이력`} variant="text" disabled={busy} onPress={() => { void getDailyWorkHistory(employee.store_id, employee.id, row.work_date).then(setHistory).catch(e => setMessage(getErrorMessage(e))); }} />
      </View>)}
      {history && <View style={styles.card}><Text style={styles.title}>작성·수정·확인 이력</Text>{history.map(row => <Text key={row.id} style={styles.hint}>{row.work_date} · 버전 {row.new_record.revision} · {row.new_record.worked_minutes}분 · 시급 {Number(row.new_record.applied_hourly_wage).toLocaleString()}원 · 세전 {Number(row.new_record.gross).toLocaleString()}원 · {labels[row.new_record.status]}</Text>)}</View>}
      {isAdmin && <Button label="확인된 일별 기록을 월 급여에 반영" variant="secondary" disabled={busy || readOnly || loading || !payrollLoaded || !!error || !rows.length || totals.pending > 0 || dirty} onPress={() => Alert.alert('월 급여에 반영할까요?', `확인된 ${rows.length}일, 세전 ${totals.gross.toLocaleString()}원으로 급여·공제를 계산해요.${savedPayroll ? ' 기존 월 명세의 수정 전 내용은 이력에 보관되고 정산 확정은 해제돼요.' : ''}`, [{ text: '취소', style: 'cancel' }, { text: '반영', onPress: () => void apply() }])} />}
    </ScrollView>
    <View style={styles.footer}>
      <Button label={isAdmin ? '일별 근무시간 저장' : '관리자에게 제출'} onPress={() => void save()} disabled={busy || readOnly || loading || !!error || (!!target && !dirty)} loading={busy} />
      {onClose && <Button label="닫기" variant="text" onPress={close} disabled={busy} />}
    </View>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ sectionHeader: { gap: 4 }, flex: { flex: 1 }, content: { padding: 20, paddingBottom: 32, gap: 16 }, footer: { padding: 16, gap: 4, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.homeBorder }, title: { fontSize: 18, fontWeight: '700', color: Colors.black }, rowTitle: { fontSize: 15, fontWeight: '600', color: Colors.black }, amount: { fontSize: 22, fontWeight: '700', color: Colors.primary }, hint: { fontSize: 13, lineHeight: 21, color: Colors.gray600 }, card: { padding: 18, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, backgroundColor: Colors.white, gap: 10 }, message: { padding: 14, color: Colors.deeper, backgroundColor: Colors.contextBg, borderRadius: 12, lineHeight: 21 } });
