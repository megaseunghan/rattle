import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Fonts } from '../../constants/fonts';
import { AppIcon } from '../icons/AppIcon';
import { Colors } from '../../constants/colors';
import { useAuth } from '../contexts/AuthContext';
import type { useRecurringFixedExpenses } from '../hooks/useRecurringFixedExpenses';
import { getErrorMessage, UserFacingError } from '../utils/error';
import { koreaExpenseMonth, nextExpenseMonth, recurringExpenseDate, validateRecurringExpense } from '../utils/recurringExpense';
import type { DatedExpense } from '../types/expenses';
import type { RecurringFixedExpenseRule, SaveRecurringFixedExpense } from '../types/recurringExpenses';
import { Field } from './ui/Field';
import { SheetModal } from './ui/SheetModal';

interface Draft {
  id: string; expectedRevision: number | null; sourceId: string | null;
  name: string; amount: string; day: string; effective: string; end: string; active: boolean; finite: boolean;
}

export interface FixedExpenseEditorHandle { openNew: () => void; openSource: (source: DatedExpense) => void; openRule: (rule: RecurringFixedExpenseRule) => void }

export const RecurringFixedExpensesPanel = forwardRef<FixedExpenseEditorHandle, {
  rowsVisible?: boolean; onDeleteSource?: (id: string, onDeleted: () => void) => void;
  yearMonth: string; legacyExpenses: DatedExpense[]; onChanged: () => Promise<void>; recurring: ReturnType<typeof useRecurringFixedExpenses>;
}>(function FixedExpenseEditor({ yearMonth, legacyExpenses, onChanged, recurring, rowsVisible = true, onDeleteSource }, ref) {
  const { store, currentRole } = useAuth();
  const insets = useSafeAreaInsets();
  const { identity, data, loading, error, refetch, save } = recurring;
  const scope = useRef(identity); scope.current = identity;
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState('');
  const [monthPicker, setMonthPicker] = useState<'effective' | 'end' | null>(null);
  const [pickerYear, setPickerYear] = useState(Number(koreaExpenseMonth().slice(0, 4)));
  useEffect(() => { setMonthPicker(null); }, [draft?.id]);
  useEffect(() => { setDraft(null); setFormError(''); }, [identity]);
  const sources = legacyExpenses.filter(e => e.category === '고정비');
  function open(rule?: RecurringFixedExpenseRule) {
    if (saving.current || loading || error) return;
    setFormError('');
    setDraft(rule ? {
      id: rule.id, expectedRevision: rule.latest_revision, sourceId: rule.source_expense_id,
      name: rule.latest.name, amount: rule.latest.amount.toLocaleString('ko-KR'), day: String(rule.latest.payment_day),
      effective: [nextExpenseMonth(koreaExpenseMonth()), rule.latest.effective_month].sort().at(-1)!, end: rule.latest.end_month ?? '', active: rule.latest.active, finite: !!rule.latest.end_month,
    } : {
      id: randomUUID(), expectedRevision: null, sourceId: null, name: '', amount: '', day: '',
      effective: yearMonth > koreaExpenseMonth() ? yearMonth : koreaExpenseMonth(), end: '', active: true, finite: false,
    });
  }
  function openSource(source: DatedExpense) {
    const rule = data?.rules.find(item => item.source_expense_id === source.id);
    if (rule) { open(rule); return; }
    if (saving.current || loading || error) return;
    setFormError('');
    setDraft({ id: randomUUID(), expectedRevision: null, sourceId: source.id,
      name: source.name, amount: source.amount.toLocaleString('ko-KR'), day: source.occurred_on?.slice(8, 10) ?? '',
      effective: [nextExpenseMonth(source.year_month), koreaExpenseMonth()].sort().at(-1)!, end: '', active: true, finite: false });
  }
  useImperativeHandle(ref, () => ({
    openNew: () => { if (!loading && !error && currentRole === 'admin') open(); },
    openRule: rule => { if (currentRole === 'admin') open(rule); },
    openSource: source => { if (currentRole === 'admin') openSource(source); },
  }));
  function patch(values: Partial<Draft>) { if (!busy) { setFormError(''); setDraft(prev => prev ? { ...prev, ...values } : prev); } }
  function minimumMonth(field: 'effective' | 'end') {
    if (field === 'end') return draft?.effective ?? koreaExpenseMonth();
    const base = draft?.expectedRevision != null ? nextExpenseMonth(koreaExpenseMonth()) : koreaExpenseMonth();
    const source = sources.find(item => item.id === draft?.sourceId);
    return source ? [base, nextExpenseMonth(source.year_month)].sort().at(-1)! : base;
  }
  function openMonthPicker(field: 'effective' | 'end') {
    if (!draft || busy) return;
    Keyboard.dismiss();
    const value = draft[field] || draft.effective;
    setPickerYear(Math.min(9999, Math.max(Number(minimumMonth(field).slice(0, 4)) || Number(koreaExpenseMonth().slice(0, 4)), Number(/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value.slice(0, 4) : koreaExpenseMonth().slice(0, 4)))));
    setMonthPicker(previous => previous === field ? null : field);
  }
  function monthButton(field: 'effective' | 'end') {
    return <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityLabel={field === 'effective' ? '발생월 달력 열기' : '종료월 달력 열기'} accessibilityState={{ expanded: monthPicker === field, disabled: busy }} onPress={() => openMonthPicker(field)} style={[styles.calendarButton, styles.calendarSlot]}><AppIcon name="calendar-outline" size={19} color={Colors.gray600} /></TouchableOpacity>;
  }
  function monthChoices(field: 'effective' | 'end') {
    if (monthPicker !== field || !draft) return null;
    const minimum = minimumMonth(field);
    return <View style={styles.monthPicker}>
      <View style={styles.pickerHeader}>
        <TouchableOpacity disabled={busy || pickerYear <= Number(minimum.slice(0, 4))} accessibilityRole="button" accessibilityLabel="이전 연도" onPress={() => setPickerYear(year => year - 1)} style={styles.calendarButton}><AppIcon name="chevron-back" size={18} color={Colors.gray600} /></TouchableOpacity>
        <Text style={styles.summaryTitle}>{pickerYear}년</Text>
        <TouchableOpacity disabled={busy || pickerYear >= 9999} accessibilityRole="button" accessibilityLabel="다음 연도" onPress={() => setPickerYear(year => year + 1)} style={styles.calendarButton}><AppIcon name="chevron-forward" size={18} color={Colors.gray600} /></TouchableOpacity>
      </View>
      <View style={styles.monthGrid}>{Array.from({ length: 12 }, (_, index) => {
        const value = `${pickerYear}-${String(index + 1).padStart(2, '0')}`;
        const selected = draft[field] === value;
        return <TouchableOpacity key={value} disabled={busy || value < minimum} accessibilityRole="button" accessibilityLabel={`${pickerYear}년 ${index + 1}월 선택`} accessibilityState={{ selected, disabled: busy || value < minimum }} onPress={() => { patch({ [field]: value }); setMonthPicker(null); }} style={[styles.monthOption, selected && styles.monthSelected, value < minimum && styles.monthDisabled]}><Text style={styles.periodText}>{index + 1}월</Text></TouchableOpacity>;
      })}</View>
    </View>;
  }
  async function submit() {
    if (!draft || !store || saving.current) return;
    const savedIdentity = identity;
    try {
      const input: SaveRecurringFixedExpense = { rule_id: draft.id, store_id: store.id, expected_revision: draft.expectedRevision,
        source_expense_id: draft.sourceId, name: draft.name.trim(), amount: Number(draft.amount.replace(/,/g, '')),
        payment_day: Number(draft.day), effective_month: draft.effective, end_month: draft.finite ? draft.end : null, active: draft.active };
      if (draft.finite && !draft.end) throw new UserFacingError('마지막 발생월을 선택해주세요.');
      validateRecurringExpense(input);
      const earliest = minimumMonth('effective');
      if (input.effective_month < earliest) throw new UserFacingError(`적용 월은 ${earliest} 이후로 입력해주세요.`);
      const source = sources.find(e => e.id === draft.sourceId);
      if (source && source.year_month >= input.effective_month) throw new UserFacingError('기존 비용의 다음 달부터 반복 일정을 적용해주세요.');
      setFormError(''); saving.current = true; setBusy(true);
      await save(input);
      if (scope.current === savedIdentity) { setDraft(null); void onChanged(); }
    } catch (caught) {
      if (scope.current === savedIdentity) setFormError(getErrorMessage(caught));
    } finally { saving.current = false; setBusy(false); }
  }
  let preview = '';
  let duration: number | null = null;
  if (draft) {
    try { preview = recurringExpenseDate(draft.effective, Number(draft.day)); } catch { /* Incomplete input is validated on save. */ }
    if (draft.finite && /^\d{4}-(0[1-9]|1[0-2])$/.test(draft.end)) {
      const [startYear, startMonth] = draft.effective.split('-').map(Number);
      const [endYear, endMonth] = draft.end.split('-').map(Number);
      const count = (endYear - startYear) * 12 + endMonth - startMonth + 1;
      if (Number.isInteger(count) && count > 0) duration = count;
    }
  }
  const editing = draft?.expectedRevision != null || !!draft?.sourceId;
  const draftSource = sources.find(source => source.id === draft?.sourceId);
  const draftRule = data?.rules.find(rule => rule.id === draft?.id);
  const occurrence = data?.occurrences.find(item => item.rule_id === draft?.id);
  const nextVersion = draftRule && draftRule.latest.effective_month > yearMonth ? draftRule.latest : null;
  const scheduledDescription = nextVersion ? nextVersion.active
    ? `${nextVersion.effective_month}부터 ${nextVersion.amount.toLocaleString()}원 · 매월 ${nextVersion.payment_day}일${nextVersion.end_month ? ` · ${nextVersion.end_month}까지` : ''}`
    : `${nextVersion.effective_month}부터 발생 중단` : null;
  const canDeleteSource = !!onDeleteSource && draftSource?.year_month === yearMonth && !data?.adoptedSourceIds.includes(draftSource.id);

  if (currentRole !== 'admin') return null;
  return <View style={styles.section}>
    {rowsVisible && (loading ? <Text>고정비 불러오는 중</Text> : error ? <>
      <Text accessibilityRole="alert">고정비 조회 실패: {error}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={() => { void refetch(); }} style={styles.button}><Text>고정비 다시 불러오기</Text></TouchableOpacity>
    </> : data?.rules.filter(rule => !legacyExpenses.some(source => source.id === rule.source_expense_id && source.year_month === yearMonth)).map(rule => {
      const item = data.occurrences.find(occurrence => occurrence.rule_id === rule.id);
      return <TouchableOpacity key={rule.id} accessibilityRole="button" accessibilityLabel={`${rule.latest.name} 고정비 항목 수정`} onPress={() => open(rule)} style={styles.row}>
        <Text style={styles.title}>{item?.name ?? rule.latest.name} · {(item?.amount ?? rule.latest.amount).toLocaleString()}원</Text>
        <Text style={styles.help}>{item ? `${item.occurred_on} · ${item.status === 'scheduled' ? '예정' : '발생'}` : `${rule.latest.effective_month}부터 · ${rule.latest.active ? '매월 ' + rule.latest.payment_day + '일' : '중단'}`}{rule.latest.end_month ? ` · ${rule.latest.end_month}까지` : ''}</Text>
      </TouchableOpacity>;
    }))}
    <SheetModal visible={!!draft} onRequestClose={() => { if (!saving.current) setDraft(null); }}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.sheetTitle} accessibilityRole="header">{editing ? '고정비 수정' : '고정비 추가'}</Text>
            <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityLabel="고정비 입력 닫기" onPress={() => { if (!saving.current) setDraft(null); }} style={styles.close}>
              <AppIcon name="close" size={23} color={Colors.gray600} />
            </TouchableOpacity>
          </View>
          {!!formError && <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{formError}</Text>}
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.fields}>
            <Field label="항목명" accessibilityLabel="고정비 항목명" placeholder="예: 임대료, 장비 할부" value={draft?.name ?? ''} editable={!busy} onChangeText={name => patch({ name })} style={styles.name} />
            <View>
              <Text style={styles.label}>월 발생금액</Text>
              <View style={styles.money}>
                <TextInput accessibilityLabel="고정비 월 금액" keyboardType="numeric" placeholder="0" placeholderTextColor={Colors.gray400}
                  value={draft?.amount ?? ''} editable={!busy} onChangeText={amount => patch({ amount })}
                  onBlur={() => { if (draft) { const value = Number(draft.amount.replace(/,/g, '')); if (Number.isFinite(value) && value > 0) patch({ amount: value.toLocaleString('ko-KR') }); } }} style={styles.amount} />
                <Text style={styles.currency}>원</Text>
              </View>
            </View>
            <View style={styles.dateRow}>
              <View style={styles.dateColumn}><Field label={editing ? '변경 적용월' : '처음 발생월'} accessibilityLabel="고정비 적용월" placeholder="YYYY-MM" value={draft?.effective ?? ''} editable={!busy} onChangeText={effective => patch({ effective })} rightSlot={monthButton('effective')} style={styles.dateInput} /></View>
              <View style={styles.dateColumn}><Field label="발생일 (매월)" accessibilityLabel="고정비 발생일" placeholder="1~31일" keyboardType="number-pad" value={draft?.day ?? ''} editable={!busy} onChangeText={day => patch({ day })} style={styles.dateInput} /></View>
            </View>
            {monthChoices('effective')}
            {editing && <Text style={styles.help}>변경 적용월부터 반영하고, 이전 내역은 그대로 남아요.</Text>}
            {Number(draft?.day) >= 29 && <Text style={styles.help}>해당 날짜가 없는 달은 그달 말일로 처리해요.</Text>}
            <View>
              <Text style={styles.label}>언제까지 반복할까요?</Text>
              <View style={styles.period}>
                {[{ finite: false, label: '계속 반복' }, { finite: true, label: '종료월 지정' }].map(option => <TouchableOpacity key={option.label}
                  accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: draft?.finite === option.finite, disabled: busy }} disabled={busy}
                  onPress={() => patch({ finite: option.finite })} style={[styles.periodOption, draft?.finite === option.finite && styles.periodSelected]}>
                  <Text style={[styles.periodText, draft?.finite === option.finite && styles.periodSelectedText]}>{option.label}</Text>
                </TouchableOpacity>)}
              </View>
            </View>
            {draft?.finite && <Field label="마지막 발생월" accessibilityLabel="고정비 종료월" placeholder="YYYY-MM" value={draft.end} editable={!busy} onChangeText={end => patch({ end })} rightSlot={monthButton('end')} helpText="선택한 월까지 포함해요." />}
            {draft?.finite && monthChoices('end')}
            {!!preview && <View style={styles.summary} accessibilityLiveRegion="polite">
              <Text style={styles.summaryTitle}>매월 {Number(draft?.day)}일{draft?.finite ? ` · ${duration == null ? '종료월 확인' : `${duration}개월`}` : ', 계속 반복'}</Text>
              <Text style={styles.help}>{editing ? '변경 후 첫 발생' : '첫 발생'} {preview}</Text>
            </View>}
            {(occurrence || draftSource) && <Text style={styles.help}>선택 월 발생일 {occurrence?.occurred_on ?? draftSource?.occurred_on ?? '미상'}</Text>}
            {!!scheduledDescription && <Text style={styles.help}>{scheduledDescription}</Text>}
            {canDeleteSource && <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityLabel={`${draft?.name} 삭제`} style={styles.button} onPress={() => { if (draftSource && draft && onDeleteSource) { const deletedDraft = draft; onDeleteSource(draftSource.id, () => setDraft(current => current === deletedDraft ? null : current)); } }}><Text style={{ color: Colors.danger }}>항목 삭제</Text></TouchableOpacity>}
            {draft?.active === false && <Text style={styles.help}>현재 발생이 중단된 항목이에요. 저장해도 중단 상태는 유지돼요.</Text>}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <TouchableOpacity disabled={busy} accessibilityRole="button" accessibilityLabel="비용 저장" accessibilityState={{ busy, disabled: busy }} onPress={submit} style={styles.save}>
              <Text style={styles.saveText}>{busy ? '저장 중' : editing ? '변경 저장' : '고정비 추가'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SheetModal>
  </View>;
});

const styles = StyleSheet.create({
  section: { gap: 6 },
  title: { fontSize: 14, fontFamily: Fonts.wantedSemiBold, color: Colors.black },
  help: { fontSize: 12, lineHeight: 18, fontFamily: Fonts.wantedRegular, color: Colors.gray600 },
  button: { minHeight: 44, justifyContent: 'center', paddingVertical: 10 },
  row: { paddingVertical: 10, gap: 5, borderBottomWidth: 0.5, borderColor: Colors.gray100 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay },
  sheet: { maxHeight: '90%', backgroundColor: Colors.homeCanvas, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  handle: { width: 32, height: 4, borderRadius: 4, backgroundColor: Colors.gray300, alignSelf: 'center', marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingTop: 8, paddingBottom: 10 },
  sheetTitle: { fontSize: 23, fontFamily: Fonts.wantedSemiBold, color: Colors.black, flexShrink: 1 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  scroll: { flexShrink: 1 },
  fields: { gap: 20, paddingHorizontal: 22, paddingTop: 8, paddingBottom: 20 },
  name: { fontSize: 16, fontFamily: Fonts.wantedSemiBold },
  label: { fontSize: 13, color: Colors.gray600, fontFamily: Fonts.wantedRegular, marginBottom: 8 },
  money: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: Colors.homeBorder, paddingBottom: 8 },
  amount: { flex: 1, minWidth: 0, minHeight: 44, padding: 0, fontSize: 30, fontFamily: Fonts.geistSemiBold, color: Colors.black },
  currency: { fontSize: 16, color: Colors.gray600 },
  dateRow: { flexDirection: 'row', gap: 12 },
  dateColumn: { flex: 1, minWidth: 0 },
  dateInput: { fontSize: 14 },
  calendarButton: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  calendarSlot: { marginVertical: -13, marginRight: -8 },
  monthPicker: { backgroundColor: Colors.white, padding: 10, borderRadius: 12, gap: 8 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthOption: { width: '30%', flexGrow: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  monthSelected: { backgroundColor: Colors.bg },
  monthDisabled: { opacity: 0.35 },
  period: { flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: Colors.gray100, gap: 4 },
  periodOption: { flex: 1, minHeight: 44, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  periodSelected: { backgroundColor: Colors.white },
  periodText: { fontSize: 14, color: Colors.gray600, fontFamily: Fonts.wantedRegular },
  periodSelectedText: { color: Colors.black, fontFamily: Fonts.wantedSemiBold },
  summary: { borderTopWidth: 1, borderTopColor: Colors.homeBorder, paddingTop: 14, gap: 4 },
  summaryTitle: { fontSize: 14, fontFamily: Fonts.wantedSemiBold, color: Colors.black },
  footer: { paddingTop: 14, paddingHorizontal: 22, borderTopWidth: 1, borderTopColor: Colors.homeBorder },
  save: { minHeight: 52, backgroundColor: Colors.action, borderRadius: 13, padding: 14, justifyContent: 'center', alignItems: 'center' },
  saveText: { fontSize: 16, fontFamily: Fonts.wantedSemiBold, color: Colors.white },
  error: { paddingHorizontal: 22, paddingBottom: 10, fontSize: 13, lineHeight: 18, color: Colors.negative },
});
