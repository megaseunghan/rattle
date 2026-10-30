/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useEmployees } from '../../lib/hooks/useEmployees';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { getWageHistory, addWageChange, todayISO } from '../../lib/services/wageHistory';
import { getFinancialSummaries } from '../../lib/services/homeFinancialSummary';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { AppBar, Button, Field } from '../../lib/components/ui';
import { isWageDate, wageAmount } from '../../lib/utils/wageCondition';
import { getErrorMessage } from '../../lib/utils/error';
import { initialWageDate } from '../../lib/utils/regularWages';
import { WageHistory } from '../../types';

export default function WageConditionScreen() {
  const params = useLocalSearchParams<{ storeId: string; employeeId: string; targetMonth: string; returnScope?: string }>();
  const { store, currentRole, user } = useAuth();
  const { employees, loading, error: employeeError, refetch } = useEmployees();
  const employee = employees.find(row => row.id === params.employeeId);
  const allowed = typeof params.employeeId === 'string' && !!params.employeeId && currentRole === 'admin' && store?.id === params.storeId && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.targetMonth ?? '');
  const [history, setHistory] = useState<WageHistory[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [nonTax, setNonTax] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [editingReview, setEditingReview] = useState(false);
  const reviewing = step === 3;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [refreshResult, setRefreshResult] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const fieldPositions = useRef<Record<string, number>>({});
  const focusedField = useRef<string | null>(null);
  const keyboardVisible = useRef(false);
  const focusFrame = useRef<number | null>(null);
  useEffect(() => () => { if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current); }, []);
  const revealFocusedField = useCallback(() => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = null;
      const field = focusedField.current;
      if (!field || !keyboardVisible.current) return;
      const y = fieldPositions.current[field];
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
    });
  }, []);
  function focusField(field: string) {
    focusedField.current = field;
    revealFocusedField();
  }
  function recordField(field: string, y: number) {
    fieldPositions.current[field] = y;
    if (focusedField.current === field) revealFocusedField();
  }
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => { keyboardVisible.current = true; revealFocusedField(); });
    const hidden = Keyboard.addListener('keyboardDidHide', () => { keyboardVisible.current = false; });
    return () => { shown.remove(); hidden.remove(); };
  }, [revealFocusedField]);
  useEffect(() => {
    focusedField.current = null;
    Keyboard.dismiss();
    const frame = requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [step]);
  const saveLock = useRef(false);
  const initialDraft = useRef({ date: '', amount: '', nonTax: '', memo: '' });
  const dirty = date !== initialDraft.current.date || amount !== initialDraft.current.amount || nonTax !== initialDraft.current.nonTax || memo !== initialDraft.current.memo;
  const bypass = useConfirmLeave(!saved && dirty, { message: '입력한 급여 조건은 아직 저장되지 않았어요.', discardLabel: '내용 버리고 나가기', blockLeave: saving });
  const scope = `${user?.id}:${store?.id}:${params.employeeId}:${currentRole}`;
  const scopeRef = useRef(scope); scopeRef.current = scope;
  useEffect(() => () => { scopeRef.current = ''; }, []);
  const historyRequest = useRef(0);
  const historyScope = useRef('');
  const loadHistory = useCallback(async () => {
    const request = ++historyRequest.current;
    setLoadError(false); setHistory(null);
    try { const rows = await getWageHistory(params.employeeId); if (scopeRef.current === scope && request === historyRequest.current) { historyScope.current = scope; setHistory(rows); } }
    catch { if (scopeRef.current === scope && request === historyRequest.current) setLoadError(true); }
  }, [params.employeeId, scope]);
  useEffect(() => { if (allowed) void loadHistory(); }, [allowed, loadHistory]);
  const initialized = useRef('');
  useEffect(() => {
    if (!employee || !history || historyScope.current !== scope || initialized.current === scope) return;
    initialized.current = scope;
    const defaults = { date: history.length ? todayISO() : initialWageDate(employee), amount: String(employee.employment_type === 'part_time' ? employee.hourly_wage ?? '' : employee.base_salary), nonTax: String(employee.non_taxable), memo: '' };
    initialDraft.current = defaults;
    setDate(defaults.date); setAmount(defaults.amount); setNonTax(defaults.nonTax); setMemo(defaults.memo);
  }, [employee, history, scope]);
  const partTime = employee?.employment_type === 'part_time';
  const label = partTime ? '시급' : '기본급';
  function validateDate() {
    if (!isWageDate(date)) return '적용 시작일을 YYYY-MM-DD 형식으로 입력해 주세요.';
    if (employee?.joined_at && date < employee.joined_at) return '입사일 이후의 적용일을 입력해 주세요.';
    if (history?.some(row => row.effective_date === date)) return '같은 적용일의 조건이 있어요. 이력을 확인하고 날짜를 다시 선택해 주세요.';
    return null;
  }
  function validateAmount() {
    if (wageAmount(amount) === null || wageAmount(amount)! <= 0) return `새 ${label}을 1원 이상으로 입력해 주세요.`;
    if (wageAmount(nonTax) === null) return '비과세 금액을 입력해 주세요. 해당 없으면 0을 입력해 주세요.';
    if (!partTime && wageAmount(nonTax)! > wageAmount(amount)!) return '비과세 금액은 기본급 이하여야 해요.';
    return null;
  }
  async function refreshSaved() {
    setRefreshResult('선택월 손익을 다시 확인하고 있어요.');
    try {
      const [rows, refreshedHistory] = await Promise.all([getFinancialSummaries([params.storeId], [params.targetMonth], true), getWageHistory(params.employeeId), refetch(true)]);
      if (scopeRef.current !== scope) return;
      setHistory(refreshedHistory);
      setRefreshResult(rows[0].laborCost === null ? '조건은 저장됐지만 선택월에 확인할 직원이나 기간이 남아 있어요. 인건비에서 계속 확인해 주세요.' : '선택월 손익을 다시 불러왔어요.');
    } catch { if (scopeRef.current === scope) setRefreshResult('급여 조건은 저장됐어요. 손익을 다시 불러와 주세요.'); }
  }
  async function save() {
    if (!allowed || !employee || saveLock.current || saved) return;
    const message = validateDate() || validateAmount(); if (message) { setError(message); setStep(validateDate() ? 1 : 2); return; }
    saveLock.current = true; setSaving(true); setError(null);
    let writeStarted = false;
    try {
      const latest = await getWageHistory(employee.id);
      if (scopeRef.current !== scope) return;
      if (latest.some(row => row.effective_date === date)) { setError('같은 적용일의 조건이 새로 등록됐어요. 이력을 다시 확인해 주세요.'); setHistory(latest); setStep(1); return; }
      writeStarted = true;
      await addWageChange({ storeId: params.storeId, employeeId: employee.id, effectiveDate: date,
        baseSalary: partTime ? 0 : wageAmount(amount)!, hourlyWage: partTime ? wageAmount(amount)! : null,
        nonTaxable: wageAmount(nonTax)!, memo: memo.trim() || null });
      if (scopeRef.current !== scope) return;
      setSaved(true); Keyboard.dismiss(); await refreshSaved();
    } catch (e) { if (scopeRef.current === scope) { setOutcomeUnknown(writeStarted); setError(getErrorMessage(e, writeStarted ? '저장 결과를 확인하지 못했어요. 이력을 먼저 확인해 주세요. 중복 저장을 막기 위해 다시 저장하지 않아요.' : '이력을 확인하지 못했어요. 다시 불러와 주세요.')); } }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function checkOutcome() {
    setSaving(true);
    try {
      const latest = await getWageHistory(params.employeeId);
      if (scopeRef.current !== scope) return;
      setHistory(latest);
      const matching = latest.some(row => row.effective_date === date && Number(row.base_salary) === (partTime ? 0 : wageAmount(amount)) && row.hourly_wage === (partTime ? wageAmount(amount) : null) && Number(row.non_taxable) === wageAmount(nonTax) && (row.memo ?? '') === memo.trim());
      if (matching) { setSaved(true); setOutcomeUnknown(false); setError(null); await refreshSaved(); }
      else { setError('입력한 조건을 이력에서 확인하지 못했어요. 잠시 후 이력을 다시 확인하거나 원래 화면으로 돌아가 확인해 주세요.'); }
    } catch { setError('이력을 불러오지 못했어요. 연결 상태를 확인하고 다시 확인해 주세요.'); }
    finally { setSaving(false); }
  }
  function goBack() { if (saving) return; if (editingReview) { setError(null); setEditingReview(false); setStep(3); return; } if (!saved && !outcomeUnknown && step > 1) { setError(null); setStep(step === 3 ? 2 : 1); return; } if (saved) { bypass(); router.dismissTo({ pathname: '/(tabs)', params: { targetTab: params.returnScope === 'all' ? 'home' : 'payroll', homeScope: params.returnScope === 'all' ? 'all' : 'store', month: params.targetMonth } }); return; } router.back(); }
  function next() { Keyboard.dismiss(); const message = step === 1 ? validateDate() : validateAmount(); setError(message); if (!message) { setStep(editingReview ? 3 : step === 1 ? 2 : 3); setEditingReview(false); } }
  function editReview(target: 1 | 2) { setError(null); setEditingReview(true); setStep(target); }
  return <SafeAreaView style={styles.page}>
    <AppBar title="급여 변경" onBack={goBack} />
    {!allowed ? <ErrorMessage message="매장과 관리자 권한을 확인한 뒤 다시 열어 주세요." /> : loading ? <LoadingSpinner /> : employeeError || !employee ? <ErrorMessage message="직원 정보를 불러오지 못했어요." onRetry={() => refetch(true)} /> :
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} onLayout={revealFocusedField} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive">
          <View style={styles.context}><Text style={styles.title}>{store?.name} · {employee.name}</Text><Text style={styles.text}>확인 대상 {params.targetMonth} · {partTime ? '파트타임' : '정규직'}</Text></View>
          {!saved && <Text style={styles.progress} accessibilityLabel={`3단계 중 ${step}단계`}>{step} / 3 · {step === 1 ? '적용일 선택' : step === 2 ? '새 급여 입력' : '최종 검토'}</Text>}
          {saved ? <><Text style={styles.title}>급여 조건을 저장했어요</Text><Text style={styles.text}>적용 시작일 {date} · {label} {wageAmount(amount)?.toLocaleString()}원</Text><Text style={styles.text}>{refreshResult}</Text><Button label="손익 다시 확인" variant="secondary" onPress={() => void refreshSaved()} /><Button label="원래 화면으로" onPress={goBack} /></> : <>
            <Text style={styles.text}>변경일부터 새 급여를 적용해요. 이전 급여와 작성된 월 명세는 그대로 보관해요.</Text>
            {loadError ? <ErrorMessage message="급여 조건 이력을 불러오지 못했어요." onRetry={loadHistory} /> : history === null ? <LoadingSpinner fullScreen={false} /> : <>
              {reviewing ? <View style={styles.context}><Text style={styles.title}>저장 전 확인</Text><Text style={styles.text}>적용 시작일 {date}</Text><Text style={styles.text}>{label} {wageAmount(amount)?.toLocaleString()}원 · 비과세 {wageAmount(nonTax)?.toLocaleString()}원</Text><Text style={styles.text}>근거·메모: {memo.trim() || '입력 없음'}</Text><Button label="적용일 수정" variant="text" onPress={() => editReview(1)} disabled={saving || outcomeUnknown} /><Button label="금액·근거 수정" variant="text" onPress={() => editReview(2)} disabled={saving || outcomeUnknown} /><Text style={styles.text}>저장된 월 급여 명세는 이 작업으로 변경되지 않아요. 명세가 없는 기간의 손익은 조건 이력을 기준으로 다시 계산되므로 과거 조회 금액이 달라질 수 있어요.</Text></View> : <>
                {step === 1 && <><View onLayout={event => recordField('date', event.nativeEvent.layout.y)}><Field onFocus={() => focusField('date')} accessibilityLabel="적용 시작일" label="적용 시작일 *" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" maxLength={10} keyboardType="numbers-and-punctuation" helpText="최초 급여는 입사일부터, 변경 급여는 선택한 날짜부터 적용해요." /></View>
                <View style={styles.context}><Text style={styles.text}>현재 {label} {(partTime ? employee.hourly_wage : employee.base_salary)?.toLocaleString() ?? '미확인'}원 · 비과세 {employee.non_taxable.toLocaleString()}원</Text><Button label={showHistory ? '조건 이력 접기' : '조건 이력 보기'} variant="text" onPress={() => setShowHistory(value => !value)} />{showHistory && (history.length ? history.map(row => <Text key={row.id} style={styles.text}>{row.effective_date} · {(partTime ? row.hourly_wage : row.base_salary)?.toLocaleString()}원 · 비과세 {row.non_taxable.toLocaleString()}원</Text>) : <Text style={styles.text}>등록된 이력이 없어요.</Text>)}</View></>}
                {step === 2 && <><View onLayout={event => recordField('amount', event.nativeEvent.layout.y)}><Field onFocus={() => focusField('amount')} accessibilityLabel={`새 ${label}`} label={`새 ${label} *`} value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder="새 금액을 입력" /></View>
                <View onLayout={event => recordField('nonTax', event.nativeEvent.layout.y)}><Field onFocus={() => focusField('nonTax')} accessibilityLabel="비과세" label="비과세 *" value={nonTax} onChangeText={setNonTax} keyboardType="number-pad" placeholder="해당 없으면 0" /></View>
                <View onLayout={event => recordField('memo', event.nativeEvent.layout.y)}><Field onFocus={() => focusField('memo')} accessibilityLabel="근거·메모" label="근거·메모" value={memo} onChangeText={setMemo} multiline maxLength={1000} placeholder="확인한 계약서, 변경 사유 등" /></View></>}
              </>}
              {error && <View style={styles.error}><ErrorMessage message={error} /></View>}
            </>}
          </>}
        </ScrollView>
        {!saved && history !== null && !loadError && <View style={styles.footer}><Button label={outcomeUnknown ? '등록 이력 확인' : reviewing ? '변경 저장' : editingReview ? '검토로 돌아가기' : step === 1 ? '새 급여 입력으로' : '입력 내용 검토'} loading={saving} onPress={outcomeUnknown ? () => void checkOutcome() : reviewing ? () => void save() : next} /></View>}
      </KeyboardAvoidingView>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ progress: { color: Colors.action, fontWeight: '700', fontSize: 14 }, error: { backgroundColor: Colors.fieldErrorBg, borderRadius: 12 }, footer: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.gray200, backgroundColor: Colors.white }, page: { flex: 1, backgroundColor: Colors.homeCanvas }, flex: { flex: 1 }, content: { padding: 20, paddingBottom: 32, gap: 18 }, context: { backgroundColor: Colors.contextBg, borderRadius: 16, padding: 16, gap: 8 }, title: { fontSize: 17, fontWeight: '700', color: Colors.black }, text: { fontSize: 14, lineHeight: 22, color: Colors.gray600 } });
