/* design-system: DESIGN.md — S54 일용근로자 급여대장(확정 시안 v2). 앱은 송금하지 않고 지급 대기·지급 완료 상태만 기록한다. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { Colors } from '../../constants/colors';
import { DetailSheetMotion, Spacing } from '../../constants/designTokens';
import { useAuth } from '../../lib/contexts/AuthContext';
import { useDailyLaborers } from '../../lib/hooks/useDailyLaborers';
import { laborersAtInsuranceDays } from '../../lib/services/dailyLaborers';
import { AppBar, Button } from '../../lib/components/ui';
import { ErrorMessage } from '../../lib/components/ErrorMessage';
import { LoadingSpinner } from '../../lib/components/LoadingSpinner';
import { InlineToast } from '../../lib/components/purchase/PurchaseUi';
import { koreanDate } from '../../lib/utils/regularWages';
import { EntrySheet, type EntrySheetMode } from '../../lib/components/daily-labor/EntrySheet';
import { LaborerSheet } from '../../lib/components/daily-labor/LaborerSheet';
import { LedgerHeader, type LedgerTab } from '../../lib/components/daily-labor/LedgerHeader';
import { PaidList } from '../../lib/components/daily-labor/PaidList';
import { PaymentDetailSheet } from '../../lib/components/daily-labor/PaymentDetailSheet';
import { PaymentSheet } from '../../lib/components/daily-labor/PaymentSheet';
import { PendingList } from '../../lib/components/daily-labor/PendingList';
import { PersonView } from '../../lib/components/daily-labor/PersonView';
import { RosterList } from '../../lib/components/daily-labor/RosterList';
import { createPaymentDraft, type PaymentDraftGroup } from '../../lib/components/daily-labor/paymentDraft';
import { shiftMonth } from '../../lib/components/daily-labor/format';
import { useLedgerActions } from '../../lib/components/daily-labor/useLedgerActions';
import type { DailyLaborEntry, DailyLaborer } from '../../types';

const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/;
/** 하단 고정 버튼 높이만큼 목록 아래 여백 */
const FOOTER_SPACE = 96;
/** 한 시트가 닫힌 뒤 다음 시트를 연다(iOS는 닫히는 중인 모달 위에 새 모달을 띄우지 못한다). */
const SHEET_SWAP_MS = DetailSheetMotion.exit + 120;

type Opened<T> = { key: number; value: T } | null;

/** 일용근로자 급여대장(사장·점장). 명단은 매장이 직접 추가하고, 하루 근무를 기록한 뒤 골라서 지급 완료로 바꾼다. */
export default function DailyLaborersScreen() {
  const { yearMonth: param } = useLocalSearchParams<{ yearMonth?: string }>();
  const today = koreanDate();
  const thisMonth = today.slice(0, 7);
  const [yearMonth, setYearMonth] = useState(() => (param && MONTH_PARAM.test(param) && param <= thisMonth ? param : thisMonth));
  const { store } = useAuth();
  const { laborers, entries, payments, loading, error, reload } = useDailyLaborers(store?.id, yearMonth);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [tab, setTab] = useState<LedgerTab>('pending');
  const [personId, setPersonId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [laborerSheet, setLaborerSheet] = useState<Opened<{ target?: DailyLaborer }>>(null);
  const [entrySheet, setEntrySheet] = useState<Opened<EntrySheetMode>>(null);
  const [payDraft, setPayDraft] = useState<Opened<PaymentDraftGroup[]>>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [openCount, setOpenCount] = useState(0);

  const laborerById = useMemo(() => new Map(laborers.map(l => [l.id, l])), [laborers]);
  const nameOf = useCallback((id: string) => laborerById.get(id)?.name ?? '명단에 없는 사람', [laborerById]);
  const actions = useLedgerActions({ storeId: store?.id, reload, nameOf });
  const pending = useMemo(() => entries.filter(e => !e.payment_id), [entries]);
  const pendingIds = useMemo(() => new Set(pending.map(e => e.id)), [pending]);
  const validSelected = useMemo(() => new Set([...selected].filter(id => pendingIds.has(id))), [selected, pendingIds]);
  const insuranceIds = useMemo(() => laborersAtInsuranceDays(entries), [entries]);
  const person = personId ? laborerById.get(personId) ?? null : null;
  const detail = detailId ? payments.find(p => p.id === detailId) ?? null : null;
  const daysOf = useCallback((paymentId: string) => entries.filter(e => e.payment_id === paymentId).length, [entries]);

  // 매장을 바꾸면 이전 매장 기록으로 연 시트·선택을 모두 비운다.
  useEffect(() => {
    setPersonId(null); setSelected(new Set()); setLaborerSheet(null); setEntrySheet(null); setPayDraft(null); setDetailId(null);
  }, [store?.id]);

  // 사람 화면에서 뒤로 가면 급여대장으로 돌아온다(화면을 벗어나지 않는다).
  useEffect(() => navigation.addListener('beforeRemove', event => {
    if (!personId) return;
    event.preventDefault();
    setPersonId(null);
  }), [navigation, personId]);

  function open<T>(setter: (value: Opened<T>) => void, value: T) {
    setOpenCount(n => n + 1);
    setter({ key: openCount + 1, value });
  }

  function changeMonth(delta: number) {
    setYearMonth(m => shiftMonth(m, delta));
    setSelected(new Set());
  }

  function toggle(ids: string[], next: boolean) {
    setSelected(current => {
      const updated = new Set(current);
      ids.forEach(id => (next ? updated.add(id) : updated.delete(id)));
      return updated;
    });
  }

  function openEntry(entry: DailyLaborEntry) {
    const laborer = laborerById.get(entry.laborer_id);
    if (!laborer) return;
    open(setEntrySheet, entry.payment_id ? { kind: 'paid', laborer, entry } : { kind: 'edit', laborer, entry });
  }

  function addEntry(laborer: DailyLaborer) {
    const usedDates = new Set(entries.filter(e => e.laborer_id === laborer.id).map(e => e.work_date));
    open(setEntrySheet, { kind: 'add', laborer, yearMonth, usedDates });
  }

  const footer = (() => {
    if (person) {
      return person.is_active ? <Button label="근무 기록 추가" onPress={() => addEntry(person)} /> : null;
    }
    if (tab === 'pending' && pending.length) {
      const count = validSelected.size;
      return <Button label={count ? `${count}건 지급 완료로 바꾸기` : '기록을 골라 주세요'} disabled={!count}
        onPress={() => open(setPayDraft, createPaymentDraft(entries, validSelected))} />;
    }
    if (tab === 'roster') return <Button label="일용근로자 추가" onPress={() => open(setLaborerSheet, {})} />;
    return null;
  })();

  function body() {
    if (error) return <ErrorMessage message={error} onRetry={reload} />;
    if (loading && !laborers.length && !entries.length) return <LoadingSpinner fullScreen={false} />;
    if (person) {
      return <PersonView laborer={person} entries={entries.filter(e => e.laborer_id === person.id)} month={Number(yearMonth.slice(5))}
        revealedAccount={actions.revealed[person.id] ?? null} showInsuranceNotice={insuranceIds.has(person.id)}
        onEdit={() => open(setLaborerSheet, { target: person })} onToggleAccount={() => void actions.toggleAccount(person)} onOpenEntry={openEntry} />;
    }
    if (tab === 'pending') {
      return <PendingList entries={pending} laborerById={laborerById} selected={validSelected} insuranceIds={insuranceIds}
        onToggle={toggle} onOpenPerson={setPersonId} />;
    }
    if (tab === 'paid') return <PaidList payments={payments} nameOf={nameOf} daysOf={daysOf} onOpen={p => setDetailId(p.id)} />;
    return <RosterList laborers={laborers} onOpen={setPersonId} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <AppBar title={person ? person.name : '일용근로자'} onBack={() => (person ? setPersonId(null) : router.back())} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: (footer ? FOOTER_SPACE : 24) + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {!person && <LedgerHeader yearMonth={yearMonth} canNext={yearMonth < thisMonth} onMonth={changeMonth} tab={tab} onTab={setTab}
          counts={{ pending: pending.length, paid: payments.length, roster: laborers.length }} />}
        {body()}
      </ScrollView>
      {footer && <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View>}
      <InlineToast message={actions.toast} bottom={(footer ? FOOTER_SPACE : 32) + insets.bottom} />

      <LaborerSheet key={`laborer-${laborerSheet?.key ?? 0}`} open={laborerSheet?.value ?? null} saving={actions.saving}
        onClose={() => setLaborerSheet(null)}
        onSave={(input, previous) => void actions.saveLaborer(input, previous, () => setLaborerSheet(null))}
        onToggleActive={laborer => void actions.toggleActive(laborer, () => setLaborerSheet(null))} />
      <EntrySheet key={`entry-${entrySheet?.key ?? 0}`} mode={entrySheet?.value ?? null} today={today} saving={actions.saving}
        onClose={() => setEntrySheet(null)}
        onSave={(input, previous) => void actions.saveEntry(input, previous, () => setEntrySheet(null))}
        onDelete={entry => void actions.deleteEntry(entry, () => setEntrySheet(null))}
        onShowPayment={paymentId => { setEntrySheet(null); setTimeout(() => setDetailId(paymentId), SHEET_SWAP_MS); }} />
      <PaymentSheet key={`pay-${payDraft?.key ?? 0}`} visible={!!payDraft} initialGroups={payDraft?.value ?? []} nameOf={nameOf} today={today}
        saving={actions.saving} onClose={() => setPayDraft(null)}
        onSubmit={submit => void actions.recordPayments(submit, () => { setPayDraft(null); setSelected(new Set()); })} />
      <PaymentDetailSheet payment={detail} name={detail ? nameOf(detail.laborer_id) : ''} days={detail ? daysOf(detail.id) : 0} saving={actions.saving}
        onClose={() => setDetailId(null)} onRevert={payment => void actions.revertPayment(payment, () => setDetailId(null))} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.homeCanvas },
  content: { paddingHorizontal: Spacing.screenX, paddingTop: 12, gap: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing.screenX, paddingTop: 12, backgroundColor: Colors.homeCanvas },
});
