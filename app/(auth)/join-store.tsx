/* design-system: DESIGN.md 「직원 합류 입력」 — 질문이 아래로 하나씩 쌓이는 합류 신청. 답한 질문은 작게 줄고 눌러 고친다. 마지막 요약 단계 없음. */
import { useScopedWriteGuard } from '../../lib/hooks/useScopedWriteGuard';
import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppIcon } from '../../lib/icons/AppIcon';
import { router } from 'expo-router';
import { getStoreInviteCode, submitJoinOnboarding } from '../../lib/services/storeMembers';
import { useAuth } from '../../lib/contexts/AuthContext';
import { Colors } from '../../constants/colors';
import { Fonts } from '../../constants/fonts';
import { Spacing, Type } from '../../constants/designTokens';
import { getErrorMessage } from '../../lib/utils/error';
import { useConfirmLeave } from '../../lib/hooks/useConfirmLeave';
import { Button } from '../../lib/components/ui';
import { formatInviteCode } from '../../lib/components/store-setup/format';
import { buildJoinOnboarding, EMPTY_ONBOARDING_DRAFT, type OnboardingDraft } from '../../lib/utils/joinOnboarding';
import { type JoinIdentity, joinSteps, validateJoinQuestion } from '../../lib/utils/joinFlow';
import {
  activeIndexOf, blockStateOf, FlowError, FlowNextButton, FlowNote, initialSteps, QuestionBlock, QuestionFlowLayout, UnderlineInput,
  stepsReducer, type QuestionStepsAction, type QuestionStepsState,
} from '../../lib/components/question-flow';
import { JoinQuestionInput } from '../../lib/components/join/JoinQuestionInput';
import { isJoinQuestionAnswered, JOIN_QUESTIONS, joinAnswerText } from '../../lib/components/join/joinQuestions';
import { koreanDate } from '../../lib/utils/regularWages';
import type { EmploymentType } from '../../types';

/** 근무 형태를 바꾸면 다시 거쳐야 하는 첫 급여 질문 위치(이름·휴대폰·근무 형태·계약 다음). joinSteps 순서와 맞춘다. */
const FIRST_PAY_INDEX = 4;
const INVITE_LENGTH = 16;
/** 입력에서 코드 글자만 남긴다(하이픈·공백 제외, 대문자, 16자까지). */
function inviteChars(text: string): string { return text.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, INVITE_LENGTH); }
const SUBMIT_NOTE = '제출해도 바로 인건비에 반영되지 않아요. 관리자가 확인하고 최종 합류를 승인해요.';

export default function JoinStoreScreen() {
  const [inviteInput, setInviteInput] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteStore, setInviteStore] = useState<string | null>(null);
  const [identity, setIdentity] = useState<JoinIdentity>({ name: '', phone: '' });
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_ONBOARDING_DRAFT);
  const [employment, setEmployment] = useState<EmploymentType | null>(null);
  const [flow, setFlow] = useState<QuestionStepsState>(() => initialSteps(joinSteps(null).length));
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [completedStore, setCompletedStore] = useState<string | null>(null);
  const busy = useRef(false);
  const inviteRequest = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const { user } = useAuth();
  const canWrite = useScopedWriteGuard([]);
  const scope = useRef(user?.id);
  scope.current = user?.id;
  const steps = joinSteps(employment);
  const activeIndex = activeIndexOf(flow);
  const activeStep = steps[activeIndex];
  const isLast = flow.editing == null && flow.current === steps.length - 1;
  const isDirty = !completedStore && (!!employment || Object.values(identity).some(Boolean)
    || Object.entries(draft).some(([key, value]) => !['employmentType', 'nonTaxable'].includes(key) && value != null && value !== '') || draft.nonTaxable !== '0');
  const bypassLeaveGuard = useConfirmLeave(isDirty, { message: '지금 나가면 입력한 답변이 저장되지 않아요.' });

  // 휠 질문은 보이는 값이 곧 답이 되도록 처음 열릴 때 채운다.
  useEffect(() => {
    if (activeStep === 'joinedAt' && !draft.joinedAt) setDraft(current => ({ ...current, joinedAt: koreanDate() }));
    if (activeStep === 'weeklyMinutes' && draft.weeklyMinutes == null) setDraft(current => ({ ...current, weeklyMinutes: 20 * 60 }));
  }, [activeStep, draft.joinedAt, draft.weeklyMinutes]);

  function dispatch(action: QuestionStepsAction, total = steps.length) {
    Keyboard.dismiss();
    setError(null);
    setFlow(current => stepsReducer({ ...current, total }, action));
  }
  async function checkInvite(value: string) {
    const code = value.replace(/[ -]/g, '').toUpperCase();
    if (!/^[0-9A-F]{16}$/.test(code)) { setError('16자리 참여코드를 확인해주세요.'); return; }
    const request = ++inviteRequest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await getStoreInviteCode(code);
      if (mounted.current && request === inviteRequest.current) { setInviteCode(code); setInviteStore(result.store_name); }
    } catch (e) { if (mounted.current && request === inviteRequest.current) setError(getErrorMessage(e, '참여코드를 확인하지 못했어요. 다시 시도해 주세요.')); }
    finally { if (mounted.current && request === inviteRequest.current) setLoading(false); }
  }
  function back() {
    if (loading) return;
    if (flow.editing != null || flow.current > 0) dispatch({ type: 'back' });
    else router.back();
  }
  function chooseEmployment(type: EmploymentType) {
    setError(null);
    const changed = employment != null && employment !== type;
    setEmployment(type);
    setDraft(current => ({ ...current, employmentType: type }));
    // 고치는 중에 근무 형태를 바꾸면 새 형태의 급여 질문부터 다시 거친다(다른 답은 그대로).
    if (changed && flow.current >= FIRST_PAY_INDEX) setFlow(current => ({ ...current, total: joinSteps(type).length, current: FIRST_PAY_INDEX, editing: null, revealed: FIRST_PAY_INDEX }));
  }
  function next() {
    try { validateJoinQuestion(activeStep, identity, draft, employment); }
    catch (e) { setError(getErrorMessage(e, '답을 다시 확인해 주세요.')); return; }
    if (isLast) { void submit(); return; }
    dispatch({ type: 'advance' });
  }
  async function submit() {
    if (!user || busy.current) return;
    for (const [index, question] of steps.entries()) {
      try { validateJoinQuestion(question, identity, draft, employment); }
      catch (e) { if (index < flow.current) dispatch({ type: 'edit', index }); setError(getErrorMessage(e, '답을 다시 확인해 주세요.')); return; }
    }
    const userId = user.id;
    try {
      const profile = buildJoinOnboarding(draft, 'applicant');
      busy.current = true;
      setLoading(true);
      setSubmitError(null);
      if (!inviteCode) throw new Error('참여코드를 확인해주세요.');
      if (!canWrite()) return;
      const result = await submitJoinOnboarding(inviteCode, identity.name.trim(), identity.phone, profile);
      if (mounted.current && scope.current === userId) {
        Keyboard.dismiss();
        bypassLeaveGuard();
        setCompletedStore(result.store_name);
      }
    } catch (e) {
      if (mounted.current && scope.current === userId) setSubmitError(getErrorMessage(e, '신청하지 못했어요. 답은 그대로 있으니 다시 제출해 주세요.'));
    } finally {
      busy.current = false;
      if (mounted.current && scope.current === userId) setLoading(false);
    }
  }

  if (completedStore) return <SafeAreaView style={styles.container}>
    <View style={styles.success}>
      <AppIcon name="checkmark-circle-outline" size={44} color={Colors.action} />
      <Text accessibilityRole="header" style={styles.title}>신청했어요</Text>
      <Text style={styles.description}>관리자 확인을 기다려 주세요. {completedStore} 관리자가 내용을 확인하고 최종 합류를 승인하면 매장에 들어갈 수 있어요.</Text>
    </View>
    <View style={styles.footer}><Button label="확인" onPress={() => router.back()} /></View>
  </SafeAreaView>;

  // 참여코드 입력도 합류 질문과 같은 모양(2026-11-28 사용자 결정, 시안에는 이 단계가 없어 합류 질문 방식을 따른다).
  if (!inviteCode) return <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
    <QuestionFlowLayout onBack={() => router.back()} backLabel="뒤로가기" backDisabled={loading}
      footer={<FlowNextButton label="매장 확인" onPress={() => void checkInvite(inviteInput)} loading={loading}
        disabled={inviteChars(inviteInput).length !== INVITE_LENGTH} />}>
      <QuestionBlock first title="참여코드를 알려 주세요" description="관리자에게 받은 16자리 코드예요." state="active">
        <UnderlineInput label="참여코드" value={inviteInput} editable={!loading} autoFocus autoCorrect={false} autoCapitalize="characters"
          placeholder="1234-ABCD-5678-EF90" maxLength={INVITE_LENGTH + 3} returnKeyType="done"
          onSubmitEditing={() => { if (inviteChars(inviteInput).length === INVITE_LENGTH) void checkInvite(inviteInput); }}
          onChangeText={text => { setError(null); setInviteInput(formatInviteCode(inviteChars(text))); }} />
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </QuestionBlock>
    </QuestionFlowLayout>
  </SafeAreaView>;

  const footer = <>
    {isLast && <Text style={styles.submitNote}>{SUBMIT_NOTE}</Text>}
    <FlowNextButton label={isLast ? '관리자에게 제출' : flow.editing != null ? '확인' : '다음'} onPress={next} loading={loading}
      disabled={!isJoinQuestionAnswered(activeStep, identity, draft, employment)} />
  </>;
  return <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
    <QuestionFlowLayout onBack={back} backLabel="뒤로가기" backDisabled={loading} footer={footer}
      progress={{ step: activeIndex + 1, total: steps.length, label: '합류 신청 진행' }}>
      <Text style={styles.inviteStore} accessibilityLabel={`신청 매장 ${inviteStore}`}>{inviteStore}에 합류 신청해요</Text>
      {steps.slice(0, flow.current + 1).map((step, index) => <QuestionBlock key={step} first={index === 0}
        title={JOIN_QUESTIONS[step].title} description={JOIN_QUESTIONS[step].description} state={blockStateOf(flow, index)}
        answer={joinAnswerText(step, identity, draft, employment)} editDisabled={loading}
        onEdit={() => dispatch({ type: 'edit', index })} animateIn={flow.revealed === index}>
        <JoinQuestionInput step={step} identity={identity} draft={draft} employment={employment} disabled={loading}
          onIdentity={patch => { setError(null); setIdentity(current => ({ ...current, ...patch })); }}
          onDraft={patch => { setError(null); setDraft(current => ({ ...current, ...patch })); }}
          onEmployment={chooseEmployment} />
        {error && step === activeStep && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {step === 'incomeType' && draft.incomeType === 'unknown' && <FlowNote>관리자가 확인하고 정해요.</FlowNote>}
      </QuestionBlock>)}
      {submitError && <FlowError message={submitError} />}
    </QuestionFlowLayout>
  </SafeAreaView>;
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  title: { fontFamily: Fonts.wantedBold, fontSize: Type.xl, color: Colors.black, lineHeight: 30 },
  inviteStore: { fontFamily: Fonts.wantedSemiBold, fontSize: Type.sm, color: Colors.action, marginBottom: 4 },
  description: { fontFamily: Fonts.wantedRegular, fontSize: Type.base, color: Colors.gray500, lineHeight: 22, marginTop: 10, marginBottom: 28 },
  footer: { padding: Spacing.ctaPadding, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray100, backgroundColor: Colors.white },
  submitNote: { fontFamily: Fonts.wantedRegular, fontSize: Type.sm, color: Colors.gray600, lineHeight: 20, marginBottom: 12 },
  error: { fontFamily: Fonts.wantedRegular, color: Colors.negative, fontSize: Type.sm, lineHeight: 20, marginTop: 12 },
  success: { flex: 1, justifyContent: 'center', padding: Spacing.screenX, gap: 16 },
});
