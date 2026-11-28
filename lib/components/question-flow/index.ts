/**
 * 공용 질문 흐름(매장 만들기 S02·직원 합류 신청이 함께 쓴다). design-system: DESIGN.md
 * 「매장 만들기·마저 채우기·직원 합류 시안 확정 · 2026-11-27」의 질문 방식.
 *
 * 사용법
 *   const steps = useQuestionSteps(질문 수, 복원한 위치);
 *   <QuestionFlowLayout onBack={...} progress={{ step: steps.current + 1, total, label: '○○ 진행' }}
 *     footer={<FlowNextButton label={steps.isLast ? '제출' : '다음'} disabled={!유효} onPress={() => steps.dispatch({ type: 'advance' })} />}>
 *     {질문들.slice(0, steps.current + 1).map((q, i) =>
 *       <QuestionBlock key={q.id} first={i === 0} title=... description=... state={steps.stateOf(i)}
 *         answer={한 줄 요약} onEdit={() => steps.dispatch({ type: 'edit', index: i })} animateIn={steps.revealed === i}>
 *         <UnderlineInput label=... /> 또는 <ChoiceList .../> 또는 <ChoiceButtons .../>
 *       </QuestionBlock>)}
 *   </QuestionFlowLayout>
 *
 * - 답은 부르는 쪽 상태에 둔다. 'back'은 위치만 바꾸고 답을 지우지 않는다.
 * - 고치는 중(editing)에 뒤로 가면 펼침만 닫으므로, 고치기 전 값을 되돌리려면 'edit' 때 저장해 둔 값을 부르는 쪽이 복원한다.
 * - QuestionBlock은 스크롤 내용의 바로 아래 자식이어야 활성될 때 그 자리로 스크롤된다.
 * - 화면 전용 문구·검증·저장은 여기 넣지 않는다.
 */
export { QuestionFlowLayout, useQuestionFlow, type QuestionFlowLayoutProps } from './QuestionFlowLayout';
export { FlowProgress } from './FlowProgress';
export { QuestionBlock, type QuestionBlockProps, type QuestionBlockState } from './QuestionBlock';
export { UnderlineInput, type UnderlineInputProps } from './UnderlineInput';
export { ChoiceList, type ChoiceListProps, type ChoiceOption } from './ChoiceList';
export { ChoiceButtons, type ChoiceButtonsProps, type ChoiceButtonOption } from './ChoiceButtons';
export { FlowNextButton, type FlowNextButtonProps } from './FlowNextButton';
export { FlowSubLabel, FlowNote, FlowError } from './FlowText';
export { useReduceMotion } from './useReduceMotion';
export {
  useQuestionSteps, stepsReducer, initialSteps, activeIndexOf, blockStateOf,
  type QuestionSteps, type QuestionStepsState, type QuestionStepsAction,
} from './questionSteps';
