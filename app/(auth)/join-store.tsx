import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform,
  Pressable, Keyboard, TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { submitJoinOnboarding } from '../../lib/services/storeMembers';
import { useAuth } from '../../lib/contexts/AuthContext';
import { Colors } from '../../constants/colors';
import { Radius, Spacing, Type } from '../../constants/designTokens';
import { getErrorMessage } from '../../lib/utils/error';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { AppBar, Button, Field } from '../../lib/components/ui';
import { buildJoinOnboarding, OnboardingDraft } from '../../lib/utils/joinOnboarding';
import { JoinIdentity, JoinQuestion, JoinStep, joinSteps, validateJoinQuestion } from '../../lib/utils/joinFlow';
import type { EmploymentType } from '../../types';

interface Question {
  title: string;
  label: string;
  help: string;
  placeholder?: string;
  keyboard?: TextInputProps['keyboardType'];
  maxLength?: number;
}
const QUESTIONS: Record<JoinQuestion, Question> = {
  name: { title: '이름을 알려주세요', label: '이름', help: '매장 관리자가 알아볼 수 있는 본인 이름을 입력해주세요.', placeholder: '이름', maxLength: 100 },
  phone: { title: '연락받을 번호는 무엇인가요?', label: '휴대폰 번호', help: '직원 정보에 연결할 본인 휴대폰 번호예요.', placeholder: '010-0000-0000', keyboard: 'phone-pad', maxLength: 15 },
  businessNumber: { title: '어느 매장에 합류하나요?', label: '사업자번호', help: '매장 관리자에게 받은 사업자등록번호 10자리를 입력해주세요.', placeholder: '1234567890', keyboard: 'number-pad', maxLength: 10 },
  employmentType: { title: '어떤 형태로 근무하나요?', label: '근무 형태', help: '선택한 근무 형태에 맞춰 급여 정보를 물어볼게요.' },
  hourlyWage: { title: '약속한 시급은 얼마인가요?', label: '시급', help: '세전 시급을 원 단위로 입력해주세요.', placeholder: '예: 13,000', keyboard: 'number-pad', maxLength: 12 },
  weeklyHours: { title: '일주일에 몇 시간 근무하나요?', label: '주 근무시간', help: '예정된 주 근무시간을 정수로 입력해주세요. 아직 정해지지 않았다면 관리자에게 확인해주세요.', placeholder: '예: 20', keyboard: 'number-pad', maxLength: 3 },
  baseSalary: { title: '월 급여는 얼마인가요?', label: '월 기본급', help: '비과세를 포함한 월 세전 총액을 원 단위로 입력해주세요.', placeholder: '예: 3,000,000', keyboard: 'number-pad', maxLength: 15 },
  nonTaxable: { title: '그중 비과세 금액은 얼마인가요?', label: '월 비과세 금액', help: '월 급여에 포함된 비과세 금액이에요. 없다면 0원으로 계속하면 돼요.', placeholder: '없으면 0', keyboard: 'number-pad', maxLength: 15 },
  joinedAt: { title: '입사일은 언제인가요?', label: '입사일', help: '처음 근무하는 날짜를 입력하거나 달력에서 선택해주세요.', placeholder: 'YYYY-MM-DD', keyboard: 'numbers-and-punctuation', maxLength: 10 },
  bankName: { title: '급여를 받을 은행은 어디인가요?', label: '은행', help: '은행을 선택해주세요. 목록에 없다면 직접 입력할 수 있어요.', placeholder: '은행 이름', maxLength: 50 },
  accountNumber: { title: '급여 계좌번호를 알려주세요', label: '급여 계좌번호', help: '본인 명의 계좌를 입력해주세요. 앞자리의 0도 그대로 입력해주세요.', placeholder: '계좌번호', keyboard: 'number-pad', maxLength: 40 },
};
const BANKS = ['국민은행', '신한은행', '우리은행', '하나은행', 'NH농협은행', '카카오뱅크', '토스뱅크'];
const OTHER_BANK_GROUPS = [
  { title: '다른 은행', banks: ['IBK기업은행', 'KDB산업은행', 'SC제일은행', '한국씨티은행', 'Sh수협은행', '케이뱅크'] },
  { title: '지역 은행', banks: ['iM뱅크(구 대구은행)', 'BNK부산은행', 'BNK경남은행', '광주은행', '전북은행', '제주은행'] },
  { title: '그 밖의 금융기관', banks: ['우체국', '새마을금고', '신협', '지역농축협', '수협(회원조합)', '산림조합'] },
];
const MONEY = new Set<JoinStep>(['hourlyWage', 'baseSalary', 'nonTaxable']);
function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function money(value: string) {
  const number = Number(value.replace(/,/g, ''));
  return value.trim() && Number.isFinite(number) ? `${number.toLocaleString('ko-KR')}원` : value || '미입력';
}

export default function JoinStoreScreen() {
  const [identity, setIdentity] = useState<JoinIdentity>({ name: '', phone: '', businessNumber: '' });
  const [draft, setDraft] = useState<OnboardingDraft>({ employmentType: 'regular', hourlyWage: '', weeklyHours: '', baseSalary: '', nonTaxable: '0', joinedAt: '', bankName: '', accountNumber: '' });
  const [employment, setEmployment] = useState<EmploymentType | null>(null);
  const [step, setStep] = useState<JoinStep>('name');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [moreBanks, setMoreBanks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [completedStore, setCompletedStore] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { user } = useAuth();
  const scope = useRef(user?.id);
  scope.current = user?.id;
  const steps = joinSteps(employment);
  const index = steps.indexOf(step);
  const review = step === 'review';
  const isDirty = !completedStore && (!!employment || Object.values(identity).some(Boolean) ||
    Object.entries(draft).some(([key, value]) => !['employmentType', 'nonTaxable'].includes(key) && !!value) || draft.nonTaxable !== '0');
  const bypassLeaveGuard = useConfirmLeave(isDirty, { message: '지금 나가면 입력한 답변이 저장되지 않아요.' });

  function go(target: JoinStep) {
    Keyboard.dismiss();
    setError(null);
    setPickerVisible(false);
    setStep(target);
  }
  function back() {
    if (loading) return;
    if (editing) { setEditing(false); go('review'); }
    else if (index > 0) go(steps[index - 1]);
    else router.back();
  }
  function valueOf(question: JoinQuestion): string {
    if (question in identity) return identity[question as keyof JoinIdentity];
    return draft[question as keyof OnboardingDraft];
  }
  function change(question: JoinQuestion, value: string) {
    setError(null);
    if (question in identity) setIdentity(current => ({ ...current, [question]: value }));
    else setDraft(current => ({ ...current, [question]: value }));
  }
  function next() {
    try {
      validateJoinQuestion(step, identity, draft, employment);
      // Changing the employment type also revisits the newly relevant pay questions.
      if (step === 'employmentType') {
        setEditing(false);
        go(employment === 'part_time' ? 'hourlyWage' : 'baseSalary');
      } else if (editing) {
        if (step === 'baseSalary') validateJoinQuestion('nonTaxable', identity, draft, employment);
        setEditing(false);
        go('review');
      } else go(steps[index + 1]);
    } catch (e) {
      if (editing && step === 'baseSalary') {
        try { validateJoinQuestion('baseSalary', identity, draft, employment); go('nonTaxable'); }
        catch { /* Keep an invalid salary on its own question. */ }
      }
      setError(getErrorMessage(e));
    }
  }
  async function submit() {
    if (!user || busy.current) return;
    for (const question of steps) {
      try { validateJoinQuestion(question, identity, draft, employment); }
      catch (e) { setEditing(true); go(question); setError(getErrorMessage(e)); return; }
    }
    const userId = user.id;
    try {
      const profile = buildJoinOnboarding(draft);
      busy.current = true;
      setLoading(true);
      setError(null);
      const result = await submitJoinOnboarding(identity.businessNumber.replace(/[^0-9]/g, ''), identity.name, identity.phone, profile);
      if (mounted.current && scope.current === userId) {
        Keyboard.dismiss();
        bypassLeaveGuard();
        setCompletedStore(result.store_name);
      }
    } catch (e) {
      if (mounted.current && scope.current === userId) setError(getErrorMessage(e));
    } finally {
      busy.current = false;
      if (mounted.current && scope.current === userId) setLoading(false);
    }
  }
  function edit(question: JoinQuestion) { setEditing(true); go(question); }
  function bankOption(bank: string) {
    return <Pressable key={bank} accessibilityRole="button" accessibilityState={{ selected: draft.bankName === bank }}
      onPress={() => { Keyboard.dismiss(); change('bankName', bank); }}
      style={({ pressed }) => [styles.bank, draft.bankName === bank && styles.choiceSelected, pressed && styles.pressed]}>
      <Text style={styles.bankText}>{bank}</Text>
    </Pressable>;
  }
  function answer(question: JoinQuestion) {
    if (question === 'employmentType') return employment === 'part_time' ? '파트타이머 · 시급제' : '직원 · 월급제';
    const value = valueOf(question);
    if (MONEY.has(question)) return money(value);
    return question === 'weeklyHours' ? `${value}시간` : value;
  }

  if (completedStore) return <SafeAreaView style={styles.container}>
    <AppBar title="신청 완료" />
    <View style={styles.success}>
      <Ionicons name="checkmark-circle-outline" size={44} color={Colors.primary} />
      <Text accessibilityRole="header" style={styles.title}>관리자 확인을 기다려주세요</Text>
      <Text style={styles.description}>{completedStore}에 신청 정보를 전달했어요. 관리자가 내용을 확인하고 최종 합류를 승인하면 매장에 접속할 수 있어요.</Text>
    </View>
    <View style={styles.footer}><Button label="확인" onPress={() => router.back()} /></View>
  </SafeAreaView>;

  const question = review ? null : QUESTIONS[step];
  const pickerDate = /^\d{4}-\d{2}-\d{2}$/.test(draft.joinedAt) ? new Date(`${draft.joinedAt}T12:00:00`) : new Date();
  return <SafeAreaView style={styles.container}>
    <AppBar title="매장 참여" onBack={back} />
    <View style={styles.progressWrap}>
      <Text style={styles.progressText}>{editing ? '답변 수정' : `${index + 1} / ${steps.length}`}</Text>
      <View accessibilityRole="progressbar" accessibilityLabel="신청 진행률" accessibilityValue={{ min: 1, max: steps.length, now: index + 1 }} style={styles.track}>
        <View style={[styles.progress, { width: `${((index + 1) / steps.length) * 100}%` }]} />
      </View>
    </View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView key={step} style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text accessibilityRole="header" style={styles.title}>{review ? '입력한 내용을 확인해주세요' : question?.title}</Text>
        <Text style={styles.description}>{review ? '아직 인건비에는 반영되지 않아요. 관리자에게 제출하기 전에 틀린 항목이 없는지 확인해주세요.' : question?.help}</Text>
        {review ? <View style={styles.reviewCard}>
          {steps.filter((id): id is JoinQuestion => id !== 'review').map(id => <Pressable
            key={id} onPress={() => edit(id)} disabled={loading} accessibilityRole="button" accessibilityLabel={`${QUESTIONS[id].label}, ${answer(id)}, 수정`}
            style={({ pressed }) => [styles.reviewRow, pressed && styles.pressed]}>
            <View style={styles.reviewText}><Text style={styles.reviewLabel}>{QUESTIONS[id].label}</Text><Text style={styles.answer}>{answer(id)}</Text></View>
            <Text style={styles.editLabel}>수정</Text>
          </Pressable>)}
        </View> : step === 'employmentType' ? <View style={styles.choices}>
          {([{ key: 'regular', title: '직원', caption: '월급을 기준으로 급여를 받아요.' }, { key: 'part_time', title: '파트타이머', caption: '시급과 실근무시간으로 급여를 받아요.' }] as const).map(option => <Pressable
            key={option.key} accessibilityRole="radio" accessibilityLabel={option.title} accessibilityState={{ checked: employment === option.key }}
            onPress={() => { setError(null); setEmployment(option.key); setDraft(current => ({ ...current, employmentType: option.key })); }}
            style={({ pressed }) => [styles.choice, employment === option.key && styles.choiceSelected, pressed && styles.pressed]}>
            <View style={styles.reviewText}><Text style={styles.answer}>{option.title}</Text><Text style={styles.choiceHelp}>{option.caption}</Text></View>
            <Ionicons name={employment === option.key ? 'radio-button-on' : 'radio-button-off'} size={22} color={employment === option.key ? Colors.primary : Colors.gray300} />
          </Pressable>)}
        </View> : question && <>
          {step === 'bankName' && <View>
            <View style={styles.banks}>{BANKS.map(bank => bankOption(bank))}</View>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: moreBanks }} onPress={() => setMoreBanks(current => !current)} style={styles.bankToggle}>
              <Text style={styles.editLabel}>{moreBanks ? '다른 은행 접기' : '다른 은행·금융기관 보기'}</Text>
              <Ionicons name={moreBanks ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.primary} />
            </Pressable>
            {moreBanks && OTHER_BANK_GROUPS.map(group => <View key={group.title}>
              <Text style={styles.bankGroup}>{group.title}</Text>
              <View style={styles.banks}>{group.banks.map(bank => bankOption(bank))}</View>
            </View>)}
            <Text style={styles.bankHelp}>목록에 없는 저축은행·증권사 등은 아래에 정확한 기관명을 입력해주세요.</Text>
          </View>}
          <Field key={step} label={question.label} accessibilityLabel={question.label}
            value={valueOf(step as JoinQuestion)} onChangeText={value => change(step as JoinQuestion, value)}
            placeholder={question.placeholder} maxLength={question.maxLength} keyboardType={question.keyboard} autoCorrect={false}
            editable={!loading}
            rightSlot={step === 'joinedAt' ? <Pressable accessibilityRole="button" accessibilityLabel="입사일 달력 열기" hitSlop={12} onPress={() => {
              Keyboard.dismiss();
              if (!draft.joinedAt) change('joinedAt', localDate(new Date()));
              setPickerVisible(true);
            }}><Ionicons name="calendar-outline" size={22} color={Colors.primary} /></Pressable> : undefined} />
          {step === 'joinedAt' && pickerVisible && <DateTimePicker mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            value={Number.isFinite(pickerDate.getTime()) ? pickerDate : new Date()} minimumDate={new Date(1900, 0, 1)} maximumDate={new Date(2100, 11, 31)}
            locale="ko-KR" themeVariant="light" onChange={(_, date) => { if (Platform.OS !== 'ios') setPickerVisible(false); if (date) change('joinedAt', localDate(date)); }} />}
        </>}
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </ScrollView>
      <View style={styles.footer}>
        {review && <Text style={styles.footerHelp}>관리자가 확인·수정한 뒤 최종 합류를 승인해요.</Text>}
        <Button label={review ? '관리자에게 제출' : editing && step !== 'employmentType' ? '수정 완료' : '다음'}
          onPress={review ? submit : next} loading={loading} disabled={step === 'employmentType' && !employment} />
      </View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 }, container: { flex: 1, backgroundColor: Colors.white },
  progressWrap: { paddingHorizontal: Spacing.screenX, paddingTop: 16, gap: 8 },
  progressText: { fontSize: Type.sm, color: Colors.gray500 },
  track: { height: 3, backgroundColor: Colors.gray100, borderRadius: Radius.sm, overflow: 'hidden' },
  progress: { height: '100%', backgroundColor: Colors.primary },
  content: { padding: Spacing.screenX, paddingTop: 28, paddingBottom: 24, flexGrow: 1 },
  title: { fontSize: Type.xl, fontWeight: '700', color: Colors.black, lineHeight: 30 },
  description: { fontSize: Type.base, color: Colors.gray500, lineHeight: 22, marginTop: 10, marginBottom: 28 },
  footer: { padding: Spacing.ctaPadding, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray100, backgroundColor: Colors.white },
  footerHelp: { fontSize: Type.sm, color: Colors.gray500, lineHeight: 20, marginBottom: 12 },
  choices: { gap: Spacing.fieldGap },
  choice: { minHeight: 88, padding: Spacing.cardPadding, borderWidth: 1, borderColor: Colors.gray200, borderRadius: Radius.lg, flexDirection: 'row', alignItems: 'center', gap: 12 },
  choiceSelected: { borderColor: Colors.primary, backgroundColor: Colors.tinted },
  choiceHelp: { fontSize: Type.sm, color: Colors.gray500, marginTop: 6, lineHeight: 20 },
  pressed: { opacity: 0.7 },
  banks: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  bankToggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  bankGroup: { fontSize: Type.sm, color: Colors.gray500, marginBottom: 10 },
  bankHelp: { fontSize: Type.sm, color: Colors.gray500, lineHeight: 20, marginBottom: 20 },
  bank: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: Colors.gray200, borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 12 },
  bankText: { fontSize: Type.base, color: Colors.gray700 },
  reviewCard: { borderWidth: 1, borderColor: Colors.gray100, borderRadius: Radius.lg, overflow: 'hidden' },
  reviewRow: { padding: Spacing.cardPadding, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray100, flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 68 },
  reviewText: { flex: 1 },
  reviewLabel: { fontSize: Type.sm, color: Colors.gray500, marginBottom: 4 },
  answer: { fontSize: Type.md, color: Colors.black, fontWeight: '600', lineHeight: 22 },
  editLabel: { fontSize: Type.sm, color: Colors.primary },
  error: { color: Colors.negative, fontSize: Type.sm, lineHeight: 20, marginTop: 14 },
  success: { flex: 1, justifyContent: 'center', padding: Spacing.screenX, gap: 16 },
});
