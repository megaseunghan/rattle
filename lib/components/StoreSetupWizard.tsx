/* Hallmark · genre: modern-minimal · design-system: DESIGN.md 「매장 만들기·마저 채우기·직원 합류 시안 확정 · 2026-11-27」(s02-v16) */
/**
 * M01 매장 만들기. 한 화면에서 질문이 아래로 이어진다: 이름 → 주소(선택) → 마감 시간 → 손익 공유 → 수습.
 * '매장 시작하기'로 만든 뒤 같은 자리에서 멤버 초대를 보여 주고, '홈으로 가기'에서 onCreated를 부른다.
 * POS 연결·요약 단계는 없다(POS는 매장 설정에서 연결, 서버는 'later'로 저장).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import type { PosSetupChoice } from '../../types';
import { useScopedWriteGuard } from '../hooks/useScopedWriteGuard';
import { FINANCIAL_SHARE_OPTIONS } from '../utils/financialSharing';
import {
  ChoiceList, FlowError, FlowNextButton, FlowNote, QuestionBlock, QuestionFlowLayout, UnderlineInput,
} from './question-flow';
import { ClosingTimeQuestion } from './store-setup/ClosingTimeQuestion';
import { ProbationQuestion } from './store-setup/ProbationQuestion';
import { StoreInviteStep } from './store-setup/StoreInviteStep';
import { answerOf, nextLabel, questionCopy } from './store-setup/copy';
import { ADDRESS_MAX, NAME_MAX, STORE_SETUP_QUESTIONS, canAnswer, withOpen24h, type StoreSetupQuestion } from './store-setup/draft';
import { exampleHourlyOn, localDate } from './store-setup/format';
import { useStoreSetupFlow } from './store-setup/useStoreSetupFlow';

export interface StoreSetupWizardProps {
  /** 이 계정에 이미 있는 매장의 setup_request_id. 같은 초안을 새 매장에 다시 쓰지 않는다. */
  knownRequestIds?: string[];
  userId: string;
  onCreated: (id: string, choice: PosSetupChoice) => Promise<void>;
  onCancel: () => void;
}

const TOTAL = STORE_SETUP_QUESTIONS.length;

export function StoreSetupWizard({ userId, onCreated, onCancel, knownRequestIds = [] }: StoreSetupWizardProps) {
  const canWrite = useScopedWriteGuard([userId]);
  const flow = useStoreSetupFlow({ userId, knownRequestIds, canWrite, onCancel });
  const { draft, steps, busy, created } = flow;
  const [moving, setMoving] = useState({ meridiem: false, hour: false });
  const exampleHourly = useMemo(() => exampleHourlyOn(localDate(new Date())), []);
  const backRef = useRef(flow.back);
  backRef.current = flow.back;

  useEffect(() => {
    if (created) return; // 초대 화면은 스스로 뒤로가기를 '홈으로 가기'로 처리한다.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { backRef.current(); return true; });
    return () => subscription.remove();
  }, [created]);

  if (created) {
    return <StoreInviteStep storeId={created.id} storeName={created.name} canWrite={canWrite}
      onDone={() => onCreated(created.id, created.choice)} />;
  }

  const locked = !!draft.submitted;
  const activeQuestion = STORE_SETUP_QUESTIONS[steps.activeIndex];
  const wheelMoving = moving.meridiem || moving.hour;
  const atStart = steps.current === 0 && steps.editing == null;

  function renderInput(question: StoreSetupQuestion) {
    const disabled = busy || locked;
    switch (question) {
      case 'name': return <UnderlineInput label="매장 이름" value={draft.name} placeholder="예: 래틀 연남점" maxLength={NAME_MAX}
        editable={!disabled} autoFocus returnKeyType="next" onChangeText={name => flow.change({ name })}
        onSubmitEditing={() => { void flow.next(); }} />;
      case 'address': return <UnderlineInput label="매장 주소" value={draft.address} placeholder="예: 서울 마포구 동교로 123" maxLength={ADDRESS_MAX}
        editable={!disabled} autoFocus={steps.revealed === 1} returnKeyType="next" onChangeText={address => flow.change({ address })}
        onSubmitEditing={() => { void flow.next(); }} />;
      case 'closing': return <ClosingTimeQuestion isOpen24h={draft.isOpen24h} meridiem={draft.meridiem} hour12={draft.hour12} disabled={disabled}
        onOpen24hChange={isOpen24h => flow.change(value => withOpen24h(value, isOpen24h))}
        onTimeChange={(meridiem, hour12) => flow.change({ meridiem, hour12 })}
        onMovingChange={(wheel, value) => setMoving(state => ({ ...state, [wheel]: value }))} />;
      case 'share': return <ChoiceList label="손익 공유 대상" options={FINANCIAL_SHARE_OPTIONS} value={draft.scope} disabled={disabled}
        onChange={scope => flow.change({ scope })} />;
      case 'probation': return <ProbationQuestion months={draft.probationMonths} rateText={draft.rateText} exampleHourly={exampleHourly}
        disabled={disabled} onMonthsChange={probationMonths => flow.change({ probationMonths })}
        onRateChange={rateText => flow.change({ rateText })} />;
      default: return null;
    }
  }

  return <QuestionFlowLayout onBack={flow.back} backDisabled={busy}
    backLabel={atStart || locked ? '매장 만들기 닫기' : steps.editing != null ? '고치기 닫기' : '이전 질문으로'}
    progress={{ step: steps.current + 1, total: TOTAL, label: '매장 만들기 진행' }}
    footer={<FlowNextButton label={nextLabel(activeQuestion, draft, steps.isLast)} loading={busy}
      disabled={!flow.ready || wheelMoving || !canAnswer(activeQuestion, draft)} onPress={() => { void flow.next(); }} />}>
    {STORE_SETUP_QUESTIONS.slice(0, steps.current + 1).map((question, index) => {
      const copy = questionCopy(question, draft);
      return <QuestionBlock key={question} first={index === 0} state={steps.stateOf(index)} animateIn={steps.revealed === index}
        title={copy.title} description={copy.description} badge={copy.badge} answer={answerOf(question, draft)}
        onEdit={() => flow.edit(index)} editDisabled={busy || locked}>
        {renderInput(question)}
      </QuestionBlock>;
    })}
    {locked && <FlowNote>같은 내용으로 다시 시도해요. 만든 뒤 매장 설정에서 바꿀 수 있어요.</FlowNote>}
    {flow.error && <FlowError message={flow.error} />}
  </QuestionFlowLayout>;
}
