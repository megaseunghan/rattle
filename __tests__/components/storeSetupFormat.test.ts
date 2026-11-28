import {
  closingLabel, closingNote, closingSummary, exampleHourlyOn, formatInviteCode, inviteShareMessage, localDate,
  objectParticle, parseRatePercent, probationRateNote, probationSummary, sanitizeRateInput, spokenInviteCode,
  to24h, toClosingTime,
} from '../../lib/components/store-setup/format';

describe('마감 시각 표시', () => {
  it.each([
    ['오후', 11, '오후 11시', '23:00'],
    ['오전', 12, '자정', '00:00'],
    ['오전', 2, '다음 날 오전 2시', '02:00'],
    ['오전', 5, '다음 날 오전 5시', '05:00'],
    ['오전', 6, '오전 6시', '06:00'],
    ['오후', 12, '오후 12시', '12:00'],
  ] as const)('%s %i시 → %s / %s', (meridiem, hour, label, stored) => {
    expect(closingLabel(meridiem, hour)).toBe(label);
    expect(toClosingTime(meridiem, hour)).toBe(stored);
  });

  it('24시 변환은 오전 12시를 0시, 오후 12시를 12시로 본다', () => {
    expect(to24h('오전', 12)).toBe(0);
    expect(to24h('오후', 12)).toBe(12);
    expect(to24h('오후', 1)).toBe(13);
  });

  it('닫는 시간이면 "○○에 닫아요.", 24시간이면 하루 매출 나누는 안내를 받침에 맞춰 쓴다', () => {
    expect(closingNote('오후', 11, false)).toBe('오후 11시에 닫아요.');
    expect(closingNote('오전', 2, false)).toBe('다음 날 오전 2시에 닫아요.');
    expect(closingNote('오전', 6, true)).toBe('오전 6시를 기준으로 하루 매출을 나눠요.');
    expect(closingNote('오전', 12, true)).toBe('자정을 기준으로 하루 매출을 나눠요.');
  });

  it('답한 뒤 한 줄', () => {
    expect(closingSummary('오후', 11, false)).toBe('오후 11시');
    expect(closingSummary('오전', 6, true)).toBe('24시간 영업 · 오전 6시 기준');
  });

  it('목적격 조사', () => {
    expect(objectParticle('자정')).toBe('을');
    expect(objectParticle('6시')).toBe('를');
    expect(objectParticle('ABC')).toBe('를');
  });
});

describe('수습 비율', () => {
  it('숫자만 세 자리까지 받는다', () => {
    expect(sanitizeRateInput('9a5%')).toBe('95');
    expect(sanitizeRateInput('1000')).toBe('100');
  });

  it.each([['90', 90], ['1', 1], ['100', 100], ['0', null], ['101', null], ['', null]])('%s → %s', (text, expected) => {
    expect(parseRatePercent(text)).toBe(expected);
  });

  it('최저임금 시급 예시 금액을 보여 준다', () => {
    expect(probationRateNote('90', 10_320).text).toBe('예: 시급 10,320원이면 수습 중 9,288원이에요. 직원마다 합류 승인 때 바꿀 수 있어요.');
  });

  it('최저임금 90%보다 적으면 막지 않고 굵은 안내를 붙인다', () => {
    const note = probationRateNote('80', 10_320);
    expect(note.text).toBe('예: 시급 10,320원이면 8,256원이에요. ');
    expect(note.strong).toBe('최저임금의 90%(9,288원)보다 적게 주면 위험해요.');
    expect(note.tail).toBe(' 합류 승인 때 다시 알려 드릴게요.');
  });

  it('100%, 잘못된 값, 예시 시급이 없을 때', () => {
    expect(probationRateNote('100', 10_320).text).toBe('100%면 수습이어도 급여를 줄이지 않아요.');
    expect(probationRateNote('0', 10_320).text).toBe('1~100% 사이로 적어 주세요.');
    expect(probationRateNote('', 10_320).text).toBe('1~100% 사이로 적어 주세요.');
    expect(probationRateNote('90', null)).toEqual({ text: '직원마다 합류 승인 때 바꿀 수 있어요.' });
  });

  it('예시 시급은 그날의 최저임금이고, 기준표 밖이면 null', () => {
    expect(exampleHourlyOn('2026-11-28')).toBe(10_320);
    expect(exampleHourlyOn('2027-03-01')).toBe(10_700);
    expect(exampleHourlyOn('2030-01-01')).toBeNull();
  });

  it('답한 뒤 한 줄', () => {
    expect(probationSummary(0, '90')).toBe('없음');
    expect(probationSummary(3, '90')).toBe('3개월 · 급여 90%');
  });

  it('기기 날짜는 현지 날짜로 만든다', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});

describe('참여코드', () => {
  it('네 자리씩 끊고, 화면 읽기는 한 글자씩', () => {
    expect(formatInviteCode('k7q2m9xa4rtdp8we')).toBe('K7Q2-M9XA-4RTD-P8WE');
    expect(formatInviteCode('K7Q2-M9XA-4RTD-P8WE')).toBe('K7Q2-M9XA-4RTD-P8WE');
    expect(spokenInviteCode('K7Q2M9XA')).toBe('K 7 Q 2 M 9 X A');
  });

  it('공유 문구는 멤버 관리와 같은 뜻', () => {
    expect(inviteShareMessage('연남점', 'K7Q2M9XA4RTDP8WE')).toBe('연남점 직원 참여코드: K7Q2-M9XA-4RTD-P8WE\n래틀 앱 → 기존 매장 참여에서 입력해주세요. 코드는 발급일부터 7일간 사용할 수 있어요.');
  });
});
