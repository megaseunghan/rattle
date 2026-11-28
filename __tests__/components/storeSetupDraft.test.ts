import {
  canAnswer, emptyDraft, firstIncomplete, isComplete, parseDraft, restoredStep, toCreateInput, withOpen24h,
} from '../../lib/components/store-setup/draft';
import { answerOf, nextLabel } from '../../lib/components/store-setup/copy';

const filled = () => ({ ...emptyDraft('req-1'), name: ' 연남점 ', scope: 'none' as const });

describe('매장 만들기 초안', () => {
  it('처음엔 공유를 고르지 않았고 수습 없음·90%·오후 11시다', () => {
    const draft = emptyDraft('req');
    expect(draft).toMatchObject({ scope: null, probationMonths: 0, rateText: '90', meridiem: '오후', hour12: 11, isOpen24h: false });
    expect(canAnswer('share', draft)).toBe(false);
    expect(firstIncomplete(draft)).toBe(0);
  });

  it('24시간 영업을 고르면 오전 6시, 되돌리면 오후 11시', () => {
    const on = withOpen24h(emptyDraft('r'), true);
    expect(on).toMatchObject({ isOpen24h: true, meridiem: '오전', hour12: 6 });
    expect(withOpen24h(on, false)).toMatchObject({ isOpen24h: false, meridiem: '오후', hour12: 11 });
    expect(withOpen24h(on, true)).toBe(on);
  });

  it('수습을 고르면 1~100% 비율이 있어야 넘어간다', () => {
    const draft = { ...filled(), probationMonths: 2 as const, rateText: '' };
    expect(canAnswer('probation', draft)).toBe(false);
    expect(canAnswer('probation', { ...draft, rateText: '95' })).toBe(true);
    expect(canAnswer('probation', { ...draft, probationMonths: 0 as const })).toBe(true);
  });

  it('서버 입력: 이름·주소 다듬기, HH:00, 수습 없음이면 기본 비율', () => {
    expect(toCreateInput(filled())).toEqual({
      name: '연남점', shareScope: 'none', requestId: 'req-1', address: null, closingTime: '23:00',
      isOpen24h: false, probationMonths: 0, probationRate: 0.9,
    });
    expect(toCreateInput({ ...filled(), address: ' 서울 ', probationMonths: 3, rateText: '95', isOpen24h: true, meridiem: '오전', hour12: 6 }))
      .toMatchObject({ address: '서울', closingTime: '06:00', isOpen24h: true, probationMonths: 3, probationRate: 0.95 });
  });

  it('덜 채운 초안은 서버 입력으로 바꾸지 않는다', () => {
    expect(() => toCreateInput(emptyDraft('r'))).toThrow();
    expect(isComplete(filled())).toBe(true);
  });

  it('기기 초안을 읽는다: 이상한 값은 버리고, 이전 v1 초안은 잠그지 않고 이어받는다', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft({ name: 'a' })).toBeNull();
    expect(parseDraft({ name: 'a', requestId: 'r', scope: 'everyone' })).toBeNull();
    const legacy = parseDraft({ name: '저장 매장', pos: 'later', scope: 'none', requestId: 'original', submitted: true });
    expect(legacy).toMatchObject({ name: '저장 매장', scope: 'none', requestId: 'original', step: 0 });
    expect(legacy?.submitted).toBeUndefined();
    const current = parseDraft({ ...filled(), step: 4, submitted: true, hour12: 99, rateText: '9x5' });
    expect(current).toMatchObject({ submitted: true, hour12: 11, rateText: '95', step: 4 });
  });

  it('복원 위치는 저장한 위치와 처음 모자란 질문 중 앞선 쪽, 제출한 초안은 마지막', () => {
    expect(restoredStep({ ...emptyDraft('r'), name: '연남점', step: 4 })).toBe(3);
    expect(restoredStep({ ...filled(), step: 2 })).toBe(2);
    expect(restoredStep({ ...filled(), step: 0, submitted: true })).toBe(4);
  });

  it('답한 뒤 한 줄과 하단 버튼 글자', () => {
    const draft = filled();
    expect(answerOf('address', draft)).toBe('비워 뒀어요');
    expect(answerOf('share', draft)).toBe('공유하지 않기');
    expect(answerOf('closing', draft)).toBe('오후 11시');
    expect(nextLabel('address', draft, false)).toBe('건너뛰기');
    expect(nextLabel('address', { ...draft, address: '서울' }, false)).toBe('다음');
    expect(nextLabel('probation', draft, true)).toBe('매장 시작하기');
  });
});
