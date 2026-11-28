import { useCallback, useState } from 'react';
import type { QuestionBlockState } from './QuestionBlock';

/**
 * 질문 흐름의 위치. current = 지금까지 열린 마지막 질문, editing = 답한 질문을 다시 펼쳐 고치는 중인 위치.
 * revealed = 방금 '다음'으로 새로 나타난 질문(나타남 효과용).
 */
export interface QuestionStepsState {
  total: number;
  current: number;
  editing: number | null;
  revealed: number | null;
}

export type QuestionStepsAction =
  | { type: 'advance' }
  | { type: 'back' }
  | { type: 'edit'; index: number }
  | { type: 'jump'; index: number };

export function initialSteps(total: number, current = 0): QuestionStepsState {
  return { total, current: clamp(current, total), editing: null, revealed: null };
}

function clamp(index: number, total: number): number {
  return Math.max(0, Math.min(total - 1, Math.floor(index)));
}

/** 순수 상태 전이. 뒤로 가도 답은 호출한 쪽 상태에 그대로 남는다. */
export function stepsReducer(state: QuestionStepsState, action: QuestionStepsAction): QuestionStepsState {
  switch (action.type) {
    case 'advance':
      if (state.editing != null) return { ...state, editing: null, revealed: null };
      if (state.current >= state.total - 1) return state;
      return { ...state, current: state.current + 1, revealed: state.current + 1 };
    case 'back':
      if (state.editing != null) return { ...state, editing: null, revealed: null };
      if (state.current === 0) return state;
      return { ...state, current: state.current - 1, revealed: null };
    case 'edit':
      if (action.index < 0 || action.index >= state.current) return state;
      return { ...state, editing: action.index, revealed: null };
    case 'jump':
      return { ...state, current: clamp(action.index, state.total), editing: null, revealed: null };
    default:
      return state;
  }
}

/** 지금 입력을 받는 질문. */
export function activeIndexOf(state: QuestionStepsState): number {
  return state.editing ?? state.current;
}

/** i번째 질문 블록의 모습. current보다 뒤의 질문은 그리지 않는다. */
export function blockStateOf(state: QuestionStepsState, index: number): QuestionBlockState {
  if (index === activeIndexOf(state)) return 'active';
  return index < state.current ? 'answered' : 'waiting';
}

export interface QuestionSteps extends QuestionStepsState {
  activeIndex: number;
  isLast: boolean;
  stateOf: (index: number) => QuestionBlockState;
  dispatch: (action: QuestionStepsAction) => void;
}

export function useQuestionSteps(total: number, initial = 0): QuestionSteps {
  const [state, setState] = useState(() => initialSteps(total, initial));
  const dispatch = useCallback((action: QuestionStepsAction) => setState(value => stepsReducer(value, action)), []);
  const activeIndex = activeIndexOf(state);
  return {
    ...state, activeIndex, dispatch,
    isLast: state.editing == null && state.current === total - 1,
    stateOf: index => blockStateOf(state, index),
  };
}
