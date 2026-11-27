import { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '../../constants/colors';
import { CardStyle } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useDailyLaborers } from '../../lib/hooks/useDailyLaborers';
import { usePreviewWriteGuard } from '../../lib/hooks/usePreviewWriteGuard';
import {
  calculateDailyLaborEntry, cancelDailyLaborPayment, dailyLaborTotals, defaultDailyWage, deleteDailyLaborEntry, previewDailyLaborPayment,
  recordDailyLaborPayment, saveDailyLaborEntry, saveDailyLaborer,
} from '../../lib/services/dailyLaborers';
import { maskedAccount, revealAccountNumber } from '../../lib/services/accountNumbers';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { AppBar, BottomSheet, Button, EmptyState, Field } from '../../lib/components/ui';
import { NumericText } from '../../lib/components/ui/NumericText';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { getErrorMessage } from '../../lib/utils/error';
import { koreanDate } from '../../lib/utils/regularWages';
import { isWeekend } from '../../lib/payroll';
import type { DailyLaborEntry, DailyLaborer, DailyLaborPayment } from '../../types';

const fmt = (n: number) => `${n.toLocaleString()}원`;
const money = (v: string) => (v.trim() ? Number(v.replace(/,/g, '')) : NaN);
const dayLabel = (date: string) => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

interface LaborerDraft { name: string; phone: string; bank_name: string; account_number: string; weekday_wage: string; weekend_wage: string }
interface EntryDraft { laborer_id: string; work_date: string; daily_wage: string; extra_pay: string; memo: string; is_weekend?: boolean }
const EMPTY_LABORER: LaborerDraft = { name: '', phone: '', bank_name: '', account_number: '', weekday_wage: '', weekend_wage: '' };
const sameDraft = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

/** 닫기 전에 바꾼 내용이 있으면 버릴지 묻는다. */
function confirmDiscard(dirty: boolean, close: () => void) {
  if (!dirty) { close(); return; }
  Alert.alert('입력한 내용을 버릴까요?', '저장하지 않은 내용은 사라져요.', [
    { text: '계속 입력', style: 'cancel' },
    { text: '버리기', style: 'destructive', onPress: close },
  ]);
}

/** 일용근로자 급여대장(사장·점장 입력). 계정 없이 명단·하루 근무 기록을 두고, 여러 날을 묶어 지급 처리한다. */
export default function DailyLaborersScreen() {
  const { yearMonth: param } = useLocalSearchParams<{ yearMonth?: string }>();
  const yearMonth = param && /^\d{4}-(0[1-9]|1[0-2])$/.test(param) ? param : koreanDate().slice(0, 7);
  const { store } = useAuth();
  const { canWrite } = usePreviewWriteGuard();
  const { laborers, entries, payments, loading, error, reload } = useDailyLaborers(store?.id, yearMonth);
  const [laborerSheet, setLaborerSheet] = useState<{ target?: DailyLaborer; draft: LaborerDraft; initial: LaborerDraft } | null>(null);
  const [entrySheet, setEntrySheet] = useState<{ target?: DailyLaborEntry; draft: EntryDraft; initial: EntryDraft } | null>(null);
  const [paySheet, setPaySheet] = useState<{ laborer: DailyLaborer; entries: DailyLaborEntry[]; paidOn: string } | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const byId = useMemo(() => new Map(laborers.map(l => [l.id, l])), [laborers]);
  const paymentById = useMemo(() => new Map(payments.map(p => [p.id, p])), [payments]);
  const totals = dailyLaborTotals(entries, payments);
  const unpaidByLaborer = useMemo(() => {
    const groups = new Map<string, DailyLaborEntry[]>();
    for (const entry of entries) if (!entry.payment_id) groups.set(entry.laborer_id, [...(groups.get(entry.laborer_id) ?? []), entry]);
    return [...groups.entries()];
  }, [entries]);
  useConfirmLeave(!!(laborerSheet && !sameDraft(laborerSheet.draft, laborerSheet.initial)) || !!(entrySheet && !sameDraft(entrySheet.draft, entrySheet.initial)));

  const preview = useMemo(() => {
    if (!entrySheet) return null;
    const { draft } = entrySheet;
    if (!draft.laborer_id || !Number.isFinite(money(draft.daily_wage))) return null;
    try {
      return calculateDailyLaborEntry({ laborer_id: draft.laborer_id, work_date: draft.work_date, daily_wage: money(draft.daily_wage), extra_pay: draft.extra_pay.trim() ? money(draft.extra_pay) : 0 });
    } catch (e) { return { error: getErrorMessage(e) }; }
  }, [entrySheet]);
  const paidLocked = !!entrySheet?.target?.payment_id;

  async function run(action: () => Promise<unknown>, done?: () => void) {
    if (!store || !canWrite()) return;
    setSaving(true);
    try { await action(); done?.(); await reload(); }
    catch (e) { Alert.alert('처리하지 못했어요', getErrorMessage(e)); }
    finally { setSaving(false); }
  }

  function openEntry(target?: DailyLaborEntry) {
    const today = koreanDate();
    const date = target?.work_date ?? (today.startsWith(yearMonth) ? today : `${yearMonth}-01`);
    const first = laborers.find(l => l.is_active);
    const draft: EntryDraft = target
      ? { laborer_id: target.laborer_id, work_date: target.work_date, daily_wage: String(target.daily_wage), extra_pay: String(target.extra_pay), memo: target.memo ?? '', is_weekend: target.is_weekend }
      : { laborer_id: first?.id ?? '', work_date: date, daily_wage: first ? String(defaultDailyWage(first, date) ?? '') : '', extra_pay: '', memo: '' };
    setEntrySheet({ target, draft, initial: draft });
  }

  function openLaborer(target?: DailyLaborer) {
    const draft: LaborerDraft = target
      ? { name: target.name, phone: target.phone ?? '', bank_name: target.bank_name ?? '', account_number: '',
        weekday_wage: target.weekday_wage?.toString() ?? '', weekend_wage: target.weekend_wage?.toString() ?? '' }
      : EMPTY_LABORER;
    setLaborerSheet({ target, draft, initial: draft });
  }

  function chooseLaborer(laborer: DailyLaborer) {
    setEntrySheet(sheet => sheet && ({ ...sheet, draft: { ...sheet.draft, laborer_id: laborer.id,
      daily_wage: sheet.target ? sheet.draft.daily_wage : String(defaultDailyWage(laborer, sheet.draft.work_date) ?? '') } }));
  }

  function saveLaborer() {
    if (!laborerSheet || !store) return;
    const { draft, target } = laborerSheet;
    const wage = (v: string) => (v.trim() ? money(v) : null);
    void run(() => saveDailyLaborer(store.id, { ...draft, weekday_wage: wage(draft.weekday_wage), weekend_wage: wage(draft.weekend_wage) }, target), () => setLaborerSheet(null));
  }

  function saveEntry() {
    if (!entrySheet || !store) return;
    const { draft, target } = entrySheet;
    void run(() => saveDailyLaborEntry(store.id, { laborer_id: draft.laborer_id, work_date: draft.work_date,
      daily_wage: money(draft.daily_wage), extra_pay: draft.extra_pay.trim() ? money(draft.extra_pay) : 0, memo: draft.memo, is_weekend: draft.is_weekend }, target), () => setEntrySheet(null));
  }

  function removeEntry(entry: DailyLaborEntry) {
    Alert.alert('근무 기록을 지울까요?', `${dayLabel(entry.work_date)} ${byId.get(entry.laborer_id)?.name ?? ''} 기록을 지우면 되돌릴 수 없어요.`, [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => { if (store) void run(() => deleteDailyLaborEntry(store.id, entry), () => setEntrySheet(null)); } },
    ]);
  }

  function confirmPayment() {
    if (!paySheet || !store) return;
    void run(() => recordDailyLaborPayment(store.id, paySheet.laborer.id, paySheet.entries, paySheet.paidOn.trim()), () => setPaySheet(null));
  }

  function cancelPayment(payment: DailyLaborPayment) {
    Alert.alert('지급을 취소할까요?', `${dayLabel(payment.paid_on)} 지급(${fmt(payment.net_pay)})이 취소되고 기록은 미지급으로 돌아가요. 취소한 내역은 남아요.`, [
      { text: '그대로 두기', style: 'cancel' },
      { text: '지급 취소', style: 'destructive', onPress: () => { if (store) void run(() => cancelDailyLaborPayment(store.id, payment.id)); } },
    ]);
  }

  async function revealAccount(laborer: DailyLaborer) {
    try {
      const number = await revealAccountNumber('daily_laborer', laborer.id);
      if (number) setRevealed(r => ({ ...r, [laborer.id]: number }));
    } catch (e) { Alert.alert('계좌번호를 보지 못했어요', getErrorMessage(e)); }
  }

  const payPreview = paySheet ? previewDailyLaborPayment(paySheet.entries) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <AppBar title={`일용근로자 · ${Number(yearMonth.slice(5))}월`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? <ErrorMessage message={error} onRetry={reload} /> : <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>이번 달 일용 인건비(세전)</Text>
            <NumericText style={styles.summaryValue}>{fmt(totals.gross)}</NumericText>
            <Text style={styles.summaryLine}>아직 안 준 금액(세전) {fmt(totals.unpaidGross)} · 지급한 실수령 {fmt(totals.paidNet)}</Text>
          </View>
          <Text style={styles.notice}>소득세는 지급할 때 그날 주는 금액을 합쳐서 계산해요(하루 15만 원 공제·6%·55% 감면, 합계 1,000원 미만이면 떼지 않아요). 1개월 이상 계속 일하면 국민연금·건강보험 가입 대상일 수 있어요. 세무사와 확인해 주세요.</Text>

          {unpaidByLaborer.length > 0 && <Text style={styles.sectionTitle}>지급할 금액</Text>}
          {unpaidByLaborer.map(([laborerId, unpaid]) => {
            const laborer = byId.get(laborerId);
            const pay = previewDailyLaborPayment(unpaid);
            return (
              <View key={laborerId} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{laborer?.name ?? '삭제된 명단'} · {unpaid.length}일</Text>
                  <Text style={styles.rowSub}>세전 {fmt(pay.gross)} · 예상 공제 {fmt(pay.gross - pay.net_pay)}</Text>
                </View>
                <View style={styles.rowSide}>
                  <NumericText style={styles.rowAmount}>{fmt(pay.net_pay)}</NumericText>
                  {laborer && <TouchableOpacity style={styles.payChip} accessibilityRole="button" disabled={saving}
                    onPress={() => setPaySheet({ laborer, entries: unpaid, paidOn: koreanDate() })}>
                    <Text style={[styles.payText, styles.payTextDone]}>지급 처리</Text>
                  </TouchableOpacity>}
                </View>
              </View>
            );
          })}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>근무 기록</Text>
            <TouchableOpacity onPress={() => openEntry()} disabled={!laborers.some(l => l.is_active)} accessibilityRole="button" style={styles.linkBtn}>
              <Text style={styles.linkText}>기록 추가</Text>
            </TouchableOpacity>
          </View>
          {!loading && entries.length === 0 && <EmptyState icon="calendar-outline" title="이 달 근무 기록이 없어요" description={laborers.length ? '‘기록 추가’로 하루 근무를 입력해 주세요.' : '먼저 명단에 일용근로자를 등록해 주세요.'} />}
          {entries.map(entry => {
            const payment = entry.payment_id ? paymentById.get(entry.payment_id) : undefined;
            return (
              <TouchableOpacity key={entry.id} style={styles.row} onPress={() => openEntry(entry)} accessibilityRole="button"
                accessibilityLabel={`${byId.get(entry.laborer_id)?.name ?? '일용근로자'} ${dayLabel(entry.work_date)} 근무 기록`}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle}>{dayLabel(entry.work_date)}{entry.is_weekend ? ' · 주말' : ''} · {byId.get(entry.laborer_id)?.name ?? '삭제된 명단'}</Text>
                  <Text style={styles.rowSub}>{entry.payment_id ? `${payment ? dayLabel(payment.paid_on) : ''} 지급했어요` : '아직 안 줬어요'}</Text>
                </View>
                <NumericText style={styles.rowAmount}>{fmt(entry.gross)}</NumericText>
              </TouchableOpacity>
            );
          })}

          {payments.length > 0 && <Text style={[styles.sectionTitle, styles.sectionGap]}>지급 내역</Text>}
          {payments.map(payment => (
            <View key={payment.id} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{dayLabel(payment.paid_on)} · {byId.get(payment.laborer_id)?.name ?? '삭제된 명단'}</Text>
                <Text style={styles.rowSub}>세전 {fmt(payment.gross)} · 소득세 {fmt(payment.income_tax)} · 지방소득세 {fmt(payment.local_income_tax)} · 고용보험 {fmt(payment.employment_insurance)}</Text>
              </View>
              <View style={styles.rowSide}>
                <NumericText style={styles.rowAmount}>{fmt(payment.net_pay)}</NumericText>
                <TouchableOpacity style={styles.payChip} accessibilityRole="button" disabled={saving} onPress={() => cancelPayment(payment)}>
                  <Text style={styles.payText}>지급 취소</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>명단</Text>
            <TouchableOpacity onPress={() => openLaborer()} accessibilityRole="button" style={styles.linkBtn}>
              <Text style={styles.linkText}>등록</Text>
            </TouchableOpacity>
          </View>
          {laborers.map(laborer => (
            <TouchableOpacity key={laborer.id} style={styles.row} accessibilityRole="button" accessibilityLabel={`${laborer.name} 명단 수정`} onPress={() => openLaborer(laborer)}>
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle}>{laborer.name}{laborer.is_active ? '' : ' · 사용 안 함'}</Text>
                <Text style={styles.rowSub}>평일 {laborer.weekday_wage != null ? fmt(laborer.weekday_wage) : '미정'} · 주말 {laborer.weekend_wage != null ? fmt(laborer.weekend_wage) : '평일과 같음'}</Text>
                {!!laborer.account_last4 && <Text style={styles.rowSub}>{laborer.bank_name ?? ''} {revealed[laborer.id] ?? maskedAccount(laborer.account_last4)}</Text>}
              </View>
              {!!laborer.account_last4 && !revealed[laborer.id] && <TouchableOpacity style={styles.payChip} accessibilityRole="button" onPress={() => void revealAccount(laborer)}>
                <Text style={styles.payText}>계좌 보기</Text>
              </TouchableOpacity>}
            </TouchableOpacity>
          ))}
        </>}
      </ScrollView>

      <BottomSheet visible={!!laborerSheet} onClose={() => confirmDiscard(!!laborerSheet && !sameDraft(laborerSheet.draft, laborerSheet.initial), () => setLaborerSheet(null))}
        title={laborerSheet?.target ? '명단 수정' : '일용근로자 등록'}>
        {laborerSheet && <View style={styles.sheet}>
          {([['name', '이름 *', '홍길동'], ['phone', '연락처', '010-0000-0000'], ['bank_name', '은행', '국민'],
            ['account_number', '계좌번호', laborerSheet.target?.account_last4 ? `${maskedAccount(laborerSheet.target.account_last4)} · 바꿀 때만 입력` : '숫자만'],
            ['weekday_wage', '평일 기본 일당', '150,000'], ['weekend_wage', '주말 기본 일당', '비우면 평일과 같아요']] as const).map(([key, label, placeholder]) => (
            <Field key={key} label={label} value={laborerSheet.draft[key]} placeholder={placeholder}
              keyboardType={key.endsWith('wage') || key === 'account_number' || key === 'phone' ? 'number-pad' : 'default'}
              onChangeText={v => setLaborerSheet(s => s && ({ ...s, draft: { ...s.draft, [key]: v } }))} />
          ))}
          <Text style={styles.notice}>계좌번호는 암호화해서 보관해요. 주민등록번호는 앱에 저장하지 않아요. 신고에 필요하면 세무사에게 따로 전달해 주세요.</Text>
          <Button label="저장" onPress={saveLaborer} loading={saving} disabled={!laborerSheet.draft.name.trim()} />
        </View>}
      </BottomSheet>

      <BottomSheet visible={!!entrySheet} onClose={() => confirmDiscard(!!entrySheet && !sameDraft(entrySheet.draft, entrySheet.initial), () => setEntrySheet(null))}
        title={entrySheet?.target ? '근무 기록 수정' : '근무 기록 추가'}>
        {entrySheet && <View style={styles.sheet}>
          <View style={styles.chipRow}>
            {laborers.filter(l => l.is_active || l.id === entrySheet.draft.laborer_id).map(l => (
              <TouchableOpacity key={l.id} disabled={!!entrySheet.target} onPress={() => chooseLaborer(l)} accessibilityRole="radio"
                accessibilityState={{ selected: l.id === entrySheet.draft.laborer_id }} style={[styles.chip, l.id === entrySheet.draft.laborer_id && styles.chipActive]}>
                <Text style={[styles.chipText, l.id === entrySheet.draft.laborer_id && styles.chipTextActive]}>{l.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Field label="근무일 (예: 2026-11-03)" value={entrySheet.draft.work_date} editable={!entrySheet.target}
            onChangeText={v => setEntrySheet(s => s && ({ ...s, draft: { ...s.draft, work_date: v } }))} />
          <TouchableOpacity accessibilityRole="switch" accessibilityState={{ checked: entrySheet.draft.is_weekend ?? isWeekend(entrySheet.draft.work_date) }}
            style={styles.linkBtn} onPress={() => setEntrySheet(s => s && ({ ...s, draft: { ...s.draft, is_weekend: !(s.draft.is_weekend ?? isWeekend(s.draft.work_date)) } }))}>
            <Text style={styles.linkText}>{(entrySheet.draft.is_weekend ?? isWeekend(entrySheet.draft.work_date)) ? '주말 근무 · 평일로 바꾸기' : '평일 근무 · 주말로 바꾸기'}</Text>
          </TouchableOpacity>
          <Field label="일당" value={entrySheet.draft.daily_wage} keyboardType="number-pad" editable={!paidLocked}
            onChangeText={v => setEntrySheet(s => s && ({ ...s, draft: { ...s.draft, daily_wage: v } }))} />
          <Field label="추가수당" value={entrySheet.draft.extra_pay} keyboardType="number-pad" placeholder="0" editable={!paidLocked}
            onChangeText={v => setEntrySheet(s => s && ({ ...s, draft: { ...s.draft, extra_pay: v } }))} />
          <Field label="메모" value={entrySheet.draft.memo} onChangeText={v => setEntrySheet(s => s && ({ ...s, draft: { ...s.draft, memo: v } }))} />
          {preview && ('error' in preview
            ? <Text style={styles.notice}>{preview.error}</Text>
            : <Text style={styles.notice}>하루 세전 {fmt(preview.daily_wage + preview.extra_pay)}, 고용보험 {fmt(preview.employment_insurance)}을 빼요. 소득세는 지급할 때 합쳐서 계산해요.</Text>)}
          {paidLocked && <Text style={styles.notice}>지급한 기록이라 금액은 고칠 수 없어요. 고치려면 지급 내역에서 먼저 지급을 취소해 주세요.</Text>}
          <Button label="저장" onPress={saveEntry} loading={saving} disabled={!preview || 'error' in preview} />
          {entrySheet.target && !paidLocked && <Button label="기록 삭제" variant="text" onPress={() => removeEntry(entrySheet.target!)} disabled={saving} />}
        </View>}
      </BottomSheet>

      <BottomSheet visible={!!paySheet} onClose={() => setPaySheet(null)} title={paySheet ? `${paySheet.laborer.name} 지급 처리` : '지급 처리'}>
        {paySheet && payPreview && <View style={styles.sheet}>
          <Text style={styles.notice}>{paySheet.entries.map(e => dayLabel(e.work_date)).join(', ')} 근무를 한 번에 지급해요.</Text>
          <Field label="지급일 (예: 2026-11-03)" value={paySheet.paidOn} onChangeText={v => setPaySheet(s => s && ({ ...s, paidOn: v }))} />
          <Text style={styles.notice}>세전 {fmt(payPreview.gross)}에서 소득세 {fmt(payPreview.income_tax)}, 지방소득세 {fmt(payPreview.local_income_tax)}, 고용보험 {fmt(payPreview.employment_insurance)}을 빼요.</Text>
          <NumericText style={styles.summaryValue}>{fmt(payPreview.net_pay)}</NumericText>
          <Button label={`${fmt(payPreview.net_pay)} 지급했어요`} onPress={confirmPayment} loading={saving} />
        </View>}
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  summaryCard: { ...CardStyle, padding: 20, gap: 4 },
  summaryLabel: { fontSize: 13, color: Colors.gray500 },
  summaryValue: { fontSize: 28, fontWeight: '700', color: Colors.black },
  summaryLine: { fontSize: 13, color: Colors.gray600 },
  notice: { fontSize: 13, color: Colors.gray600, lineHeight: 19 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.black },
  sectionGap: { marginTop: 12 },
  linkBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  linkText: { fontSize: 14, fontWeight: '600', color: Colors.action },
  row: { ...CardStyle, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 },
  rowMain: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: Colors.black },
  rowSub: { fontSize: 13, color: Colors.gray500 },
  rowSide: { alignItems: 'flex-end', gap: 6 },
  rowAmount: { fontSize: 15, fontWeight: '700', color: Colors.black },
  payChip: { minHeight: 32, justifyContent: 'center' },
  payText: { fontSize: 12, color: Colors.gray600 },
  payTextDone: { color: Colors.action, fontWeight: '600' },
  sheet: { gap: 12, paddingBottom: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.homeBorder, backgroundColor: Colors.white },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, color: Colors.gray500 },
  chipTextActive: { color: Colors.white, fontWeight: '500' },
});
