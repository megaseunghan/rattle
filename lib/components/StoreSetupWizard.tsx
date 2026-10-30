/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: DESIGN.md · designed-as-app */
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ScrollView, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Colors } from '../../constants/colors';
import { FinancialShareScope, PosSetupChoice } from '../../types';
import { Button, Field } from './ui';
import { FinancialSharingChoices } from './FinancialSharingChoices';
import { createStoreWithSetup } from '../services/stores';
import { getErrorMessage } from '../utils/error';
import { FINANCIAL_SHARE_OPTIONS } from '../utils/financialSharing';

type Draft = { name: string; pos: PosSetupChoice | null; scope: FinancialShareScope | null; requestId: string; submitted?: boolean };
const emptyDraft = (): Draft => ({ name: '', pos: null, scope: null, requestId: Crypto.randomUUID() });

export function StoreSetupWizard({ userId, onCreated, onCancel, knownRequestIds = [] }: {
  knownRequestIds?: string[];
  userId: string; onCreated: (id: string, choice: PosSetupChoice) => Promise<void>; onCancel: () => void;
}) {
  const key = `store-setup:v1:${userId}`;
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saving = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const [editingSummary, setEditingSummary] = useState(false);
  useEffect(() => { Keyboard.dismiss(); scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [step]);
  useEffect(() => {
    let alive = true;
    void AsyncStorage.getItem(key).then(raw => {
      if (!alive || !raw) return;
      try {
        const value = JSON.parse(raw);
        // A completed store already in the account is selected normally, never
        // reused as a new-store draft if best-effort cleanup previously failed.
        if (value.submitted && knownRequestIds.includes(value.requestId)) {
          void AsyncStorage.removeItem(key).catch(() => {});
          return;
        }
        if (typeof value.name === 'string' && typeof value.requestId === 'string' &&
          [null, 'now', 'later'].includes(value.pos) && [null, 'none', 'regular_only', 'all_staff'].includes(value.scope)) {
          setDraft(value);
          if (value.submitted && value.name.trim() && value.pos && value.scope) setStep(3);
        }
      } catch { /* Invalid local drafts restart safely. */ }
    }).catch(() => {}).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [key]);
  function change(update: Partial<Draft>) { setDraft(value => ({ ...value, ...update })); setError(null); }
  // Persist only the current snapshot, before moving steps or submitting, so writes never race.
  async function next() {
    if (saving.current || !ready || draft.submitted) return;
    if (step === 0 && !draft.name.trim()) { setError('매장 이름을 입력해주세요.'); return; }
    if (step === 1 && !draft.pos) { setError('POS 연결 시점을 선택해주세요.'); return; }
    if (step === 2 && !draft.scope) { setError('공유 대상을 선택해주세요.'); return; }
    saving.current = true; setBusy(true);
    try {
      await AsyncStorage.setItem(key, JSON.stringify(draft));
      setError(null); setStep(editingSummary ? 3 : Math.min(step + 1, 3)); setEditingSummary(false);
    } catch { setError('입력 내용을 저장하지 못했어요. 다시 시도해주세요.'); }
    finally { saving.current = false; setBusy(false); }
  }
  async function finish() {
    if (saving.current || !draft.pos || !draft.scope || !draft.name.trim()) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      const submitted = { ...draft, submitted: true };
      await AsyncStorage.setItem(key, JSON.stringify(submitted));
      setDraft(submitted);
      const store = await createStoreWithSetup({ name: draft.name, posChoice: draft.pos, shareScope: draft.scope, requestId: draft.requestId });
      await onCreated(store.id, store.pos_setup_choice ?? draft.pos);
      await AsyncStorage.removeItem(key).catch(() => {});
    } catch (e) { setError(getErrorMessage(e, '매장 설정을 마치지 못했어요. 다시 시도해주세요.')); }
    finally { saving.current = false; setBusy(false); }
  }
  async function back() {
    if (busy || draft.submitted) return;
    if (editingSummary && step === 0 && !draft.name.trim()) { setError('매장 이름을 입력해주세요.'); return; }
    await AsyncStorage.setItem(key, JSON.stringify(draft)).catch(() => {});
    if (editingSummary) { setEditingSummary(false); setStep(3); setError(null); }
    else if (step > 0) { setStep(step - 1); setError(null); } else onCancel();
  }
  const titles = ['매장 이름을 알려주세요', 'POS는 언제 연결할까요?', '손익을 누구와 공유할까요?', '이대로 시작할까요?'];
  return <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>{editingSummary ? '설정 수정' : '우리 매장 시작하기'} · {step + 1}/4</Text>
      <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel="매장 설정 진행" accessibilityValue={{ min: 1, max: 4, now: step + 1 }}>{[0, 1, 2, 3].map(i => <View key={i} style={[styles.bar, i <= step && { backgroundColor: Colors.primary }]} />)}</View>
      <Text style={styles.heading}>{titles[step]}</Text>
      <Text style={styles.description}>{['사업자번호 없이 이름만으로 시작할 수 있어요.', '지금 매장에 없어도 괜찮아요. 나중에 설정에서 연결할 수 있어요.', '공유하지 않아도 체크리스트·스케줄·본인 급여·재고를 이용할 수 있어요.', '매장 설정에서 언제든 변경할 수 있어요.'][step]}</Text>
      {step === 0 && <Field label="매장 이름" value={draft.name} onChangeText={name => change({ name })} placeholder="예: 라틀 연남점" maxLength={80} editable={!busy && !draft.submitted} autoFocus />}
      {step === 1 && <View style={{ gap: 12 }}>{(['now', 'later'] as const).map(value => <Pressable key={value} disabled={busy} accessibilityRole="radio" accessibilityLabel={value === 'now' ? '지금 연결하기' : '나중에 연결하기'} accessibilityState={{ checked: draft.pos === value, disabled: busy }} onPress={() => change({ pos: value })} style={({ pressed }) => [styles.card, styles.choiceRow, draft.pos === value && styles.selected, pressed && styles.pressed]}>
        <View style={styles.choiceBody}><Text style={styles.cardTitle}>{value === 'now' ? '지금 연결하기' : '나중에 연결하기'}</Text>
        <Text style={styles.description}>{value === 'now' ? '매장 생성 후 POS 연결 안내로 이동해요.' : '먼저 매장을 둘러보고, 준비되면 연결해요.'}</Text></View><Ionicons name={draft.pos === value ? 'radio-button-on' : 'radio-button-off'} size={22} color={draft.pos === value ? Colors.action : Colors.gray500} accessible={false} accessibilityElementsHidden />
      </Pressable>)}<Text style={styles.note}>연결이 확인되기 전에는 매출 연동 완료로 표시하지 않아요.</Text></View>}
      {step === 2 && <FinancialSharingChoices value={draft.scope} onChange={scope => change({ scope })} disabled={busy} />}
      {step === 3 && <View style={styles.card}>
        {[
          ['매장 이름', draft.name, 0], ['POS 연결', draft.pos === 'now' ? '지금 연결하기' : '나중에 연결하기', 1],
          ['손익 공유', FINANCIAL_SHARE_OPTIONS.find(o => o.value === draft.scope)?.title, 2],
        ].map(([label, value, target]) => <Pressable key={String(label)} onPress={() => { if (!busy && !draft.submitted) { setEditingSummary(true); setError(null); setStep(Number(target)); } }} accessibilityRole="button" disabled={busy || !!draft.submitted} accessibilityState={{ disabled: busy || !!draft.submitted }} accessibilityLabel={`${label} 수정`} style={styles.summaryRow}><View style={{ flex: 1, gap: 6 }}><Text style={styles.note}>{label}</Text><Text style={styles.cardTitle}>{value}</Text></View>{!draft.submitted && <Text style={{ color: Colors.action }}>수정</Text>}</Pressable>)}
      </View>}
      {draft.submitted && <Text style={styles.note}>중복 등록을 막기 위해 같은 설정으로 완료 여부를 확인해요. 완료 후 매장 설정에서 변경할 수 있어요.</Text>}
      {error && <View style={styles.error} accessibilityRole="alert"><Text style={styles.description}>{error}</Text></View>}
    </ScrollView>
    <View style={styles.bottom}><Button label={step === 3 ? '매장 시작하기' : editingSummary ? '수정 완료' : '다음'} onPress={step === 3 ? finish : next} loading={busy} disabled={!ready || busy} /><Button label={editingSummary ? '검토로 돌아가기' : step > 0 ? '이전' : '돌아가기'} variant="text" onPress={back} disabled={busy || !!draft.submitted} /></View>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, choiceBody: { flex: 1, gap: 8 }, pressed: { backgroundColor: Colors.focusBg }, error: { backgroundColor: Colors.fieldErrorBg, padding: 16, borderRadius: 12 },
  flex: { flex: 1 }, content: { padding: 24, gap: 20, paddingBottom: 30 },
  eyebrow: { fontSize: 13, fontWeight: '600', color: Colors.action }, progress: { flexDirection: 'row', gap: 6 }, bar: { height: 4, flex: 1, backgroundColor: Colors.gray200, borderRadius: 2 },
  heading: { fontSize: 26, lineHeight: 35, fontWeight: '700', color: Colors.black },
  description: { fontSize: 14, lineHeight: 22, color: Colors.gray600 },
  card: { backgroundColor: Colors.white, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: Colors.homeBorder, gap: 8 }, selected: { borderColor: Colors.primary, backgroundColor: Colors.tinted },
  cardTitle: { fontSize: 16, fontWeight: '700', color: Colors.black }, note: { color: Colors.gray500, fontSize: 12, lineHeight: 19 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, minHeight: 64 },
  bottom: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8, gap: 4, backgroundColor: Colors.homeCanvas },
});
