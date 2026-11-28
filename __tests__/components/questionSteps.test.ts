import { activeIndexOf, blockStateOf, initialSteps, stepsReducer } from '../../lib/components/question-flow/questionSteps';

describe('질문 흐름 위치', () => {
  it('다음은 아래 질문을 열고 마지막에서 멈춘다', () => {
    let state = initialSteps(3);
    state = stepsReducer(state, { type: 'advance' });
    expect(state).toMatchObject({ current: 1, revealed: 1 });
    state = stepsReducer(stepsReducer(state, { type: 'advance' }), { type: 'advance' });
    expect(state.current).toBe(2);
  });

  it('답한 질문을 고치면 그 질문만 활성되고, 다음·뒤로는 펼침만 닫는다', () => {
    let state = { ...initialSteps(4), current: 3 };
    state = stepsReducer(state, { type: 'edit', index: 1 });
    expect(activeIndexOf(state)).toBe(1);
    expect([0, 1, 2, 3].map(i => blockStateOf(state, i))).toEqual(['answered', 'active', 'answered', 'waiting']);
    expect(stepsReducer(state, { type: 'advance' })).toMatchObject({ current: 3, editing: null });
    expect(stepsReducer(state, { type: 'back' })).toMatchObject({ current: 3, editing: null });
  });

  it('아직 열지 않은 질문이나 현재 질문은 고치기로 열지 않는다', () => {
    const state = { ...initialSteps(4), current: 2 };
    expect(stepsReducer(state, { type: 'edit', index: 2 })).toBe(state);
    expect(stepsReducer(state, { type: 'edit', index: 3 })).toBe(state);
  });

  it('뒤로는 한 질문 앞으로, 처음이면 그대로', () => {
    expect(stepsReducer({ ...initialSteps(3), current: 2 }, { type: 'back' }).current).toBe(1);
    const start = initialSteps(3);
    expect(stepsReducer(start, { type: 'back' })).toBe(start);
  });

  it('복원 위치는 범위 안으로 맞춘다', () => {
    expect(initialSteps(3, 9).current).toBe(2);
    expect(stepsReducer(initialSteps(3), { type: 'jump', index: -2 }).current).toBe(0);
  });
});
